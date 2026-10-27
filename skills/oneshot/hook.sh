#!/usr/bin/env bash
# Lifecycle hook for the oneshot skill. It runs on session start, resume, and
# compaction, on every prompt, and when a turn ends. It acts only when the
# current branch carries a run log whose Status line reads running or waiting,
# or the primary checkout's .specs/ holds a series program.json whose status
# does, and it never fails the prompt.
#
# SessionStart and UserPromptSubmit print one reminder, which the host adds to
# the model's context. Stop keeps an unattended run from ending on a progress
# report: in a session that loaded the skill, while Status reads running and the
# log's Lane checklist has open items, it asks the model to continue, naming
# them. A series is the same one level up: while its program is running, the
# session that ran series.mjs is asked to take its next action. It asks once per
# state of the work, so a turn that ends again with nothing changed since the
# last ask is let go, and never while the run or the series is waiting.
set -u
host="${2:-claude}"
if [ "$#" -gt 0 ] && { [ "$1" != '--host' ] || [ "$#" != 2 ]; }; then exit 0; fi
case "$host" in claude|codex) ;; *) exit 0 ;; esac

input="$(cat 2>/dev/null || true)"
field() { printf '%s' "$input" | jq -r "$1" 2>/dev/null || true; }

cwd="$(field '.cwd // empty')"
if [ -n "$cwd" ] && [ -d "$cwd" ]; then
  cd "$cwd" 2>/dev/null || exit 0
fi

root="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0
branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null)" || exit 0

log=""
status=""
if [ -n "$branch" ] && [ "$branch" != "HEAD" ]; then
  for candidate in "$root"/.specs/*/oneshot.md; do
    [ -f "$candidate" ] || continue
    grep -qxF "Branch. $branch" "$candidate" 2>/dev/null || continue
    status="$(sed -nE 's/^Status\. (running|waiting)$/\1/p' "$candidate" | head -n 1)"
    if [ -n "$status" ]; then log="$candidate"; break; fi
  done
fi

# A series outlives every stage branch and worktree, so its program lives in the
# primary checkout, which every worktree of the repository can find.
primary="$(git worktree list --porcelain 2>/dev/null | sed -n 's/^worktree //p' | head -n 1)"
program=""
pstatus=""
for candidate in "${primary:-$root}"/.specs/*/program.json; do
  [ -f "$candidate" ] || continue
  pstatus="$(jq -r '.status // "running"' "$candidate" 2>/dev/null)"
  case "$pstatus" in running|waiting) program="$(dirname "$candidate")"; break ;; esac
done
[ -n "$log" ] || [ -n "$program" ] || exit 0

rel="${log#"$root"/}"
transcript="$(field '.transcript_path // empty')"
# Only the session that ran series.mjs has this line, so a session that merely
# saw the reminder below is not taken for the one coordinating the series.
coordinator=false
if [ -n "$program" ] && [ -f "$transcript" ] &&
  grep -qF "series program: $program/program.json" "$transcript" 2>/dev/null; then
  coordinator=true
fi
progress() {
  jq -r '"\([.stages[] | select(.state == "done")] | length) of \(.stages | length) stages done"' \
    "$program/program.json" 2>/dev/null
}
series="$(cd "$(dirname "$0")" 2>/dev/null && pwd)/series.mjs"

case "$(field '.hook_event_name // empty')" in
  Stop)
    # Background work or a scheduled wakeup starts the next turn by itself.
    [ "$(field '(.background_tasks // []) | length')" = "0" ] || exit 0
    [ "$(field '(.session_crons // []) | length')" = "0" ] || exit 0
    # A stale log must not steer a session that never ran the skill.
    [ -f "$transcript" ] || exit 0
    if [ "$host" = codex ]; then
      grep -qE '<name>oneshot</name>|\$oneshot|/skills/oneshot/SKILL\.md' "$transcript" 2>/dev/null || exit 0
    else
      grep -qE '<command-name>/oneshot<|Base directory for this skill: [^"\\]*/skills/oneshot(\\|")' \
        "$transcript" 2>/dev/null || exit 0
    fi

    # A stage run that waits on the user holds the series with it.
    [ "$status" = "waiting" ] && exit 0
    message=""
    open=""
    if [ -n "$log" ] && [ "$status" = "running" ]; then
      open="$(awk '/^## /{on = ($0 == "## Lane")} on && /^- \[ \] /' "$log" | head -n 6)"
    fi
    if [ -n "$open" ]; then
      state="$(dirname "$log")/.stop-state"
      tracked="$(cat "$(dirname "$log")"/*.md 2>/dev/null)"
      message="The oneshot run in $rel is open and this turn ended with steps still open:
$open
If nothing needs the user, continue with the first open step now, and put any status note in the same message as the next tool call. If the run does need the user, at the gate, at one of the four hard stops, at a conflict with the spec or a gate decision, or for a login only the user can supply, set \`Status. waiting\` in the run log and end the turn. If the user's last message was about something else, end the turn and leave the run open."
    elif [ "$pstatus" = "running" ] && [ "$coordinator" = true ]; then
      state="$program/.stop-state"
      tracked="$(cat "$program/program.json" 2>/dev/null)"
      message="The oneshot series in $program is open, $(progress), and this turn ended before it finished. Only series.mjs marks a stage done: a finished worker, green local checks, an open or merged pull request, and a started deployment do not. Run \`$series next\` and take the first action it prints, with any status note in the same message as the tool call. If the series needs the user, for a login, a decision, or a review only they can give, run \`$series wait <reason> \"<pending action>\"\` and end the turn. If the user's last message was about something else, end the turn and leave the series open."
    fi
    [ -n "$message" ] || exit 0

    signature="$(
      {
        git rev-parse HEAD 2>/dev/null
        git status --porcelain -uall 2>/dev/null
        git diff HEAD 2>/dev/null
        printf '%s' "$tracked"
      } | { shasum 2>/dev/null || sha1sum; } | cut -d' ' -f1
    )"
    if [ -f "$state" ] && [ "$(cat "$state" 2>/dev/null)" = "$signature" ]; then
      exit 0
    fi
    printf '%s\n' "$signature" >"$state" 2>/dev/null || exit 0

    if [ "$host" = codex ]; then
      jq -n --arg m "$message" '{decision: "block", reason: $m}' 2>/dev/null || exit 0
    else
      jq -n --arg m "$message" \
        '{hookSpecificOutput: {hookEventName: "Stop", additionalContext: $m}}' 2>/dev/null || exit 0
    fi
    ;;
  *)
    # A new prompt means the user is back, so the next end of turn may ask again.
    prompt="$(field '.prompt // empty')"
    case "$prompt" in
      "The oneshot run in $rel is open and this turn ended with steps still open:"*) ;;
      "The oneshot series in $program is open"*) ;;
      *)
        [ -n "$log" ] && rm -f "$(dirname "$log")/.stop-state" 2>/dev/null
        [ "$coordinator" = true ] && rm -f "$program/.stop-state" 2>/dev/null
        ;;
    esac
    if [ -n "$log" ]; then
      printf '%s\n' "An oneshot run is open on this branch, Status $status. Its run log $rel is the state. If the task at hand is that run, load its SKILL.md through the host's skill tool or by reading the file. After a resume or compaction, re-read the lane file the log names before taking the next open step."
    fi
    # Every new session hears about an open series once, at its start; after
    # that only the session coordinating it does.
    if [ -n "$program" ] && { [ "$(field '.hook_event_name // empty')" = "SessionStart" ] || [ "$coordinator" = true ]; }; then
      printf '%s\n' "An oneshot series is open in this repository, status $pstatus, $(progress). Its folder $program holds the approved spec, the plan, and program.json, which is the state. One session coordinates it. If the task at hand is to continue that series, load the oneshot SKILL.md and follow lanes/series.md: run \`$series next\` before anything else. For its state alone, run \`$series report\`, which changes nothing. While it is waiting, ask the user for what its pending action needs, then run \`$series resume\`."
    fi
    ;;
esac

exit 0
