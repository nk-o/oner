#!/usr/bin/env bash
# Reviews of one change by models this session is not running, one per provider.
# Each provider gets the contract and the scope, then reads the code its own way.
# Read-only: every provider is invoked in a mode that cannot write files.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# The build writes providers.env from config.json: which voices are on for this
# agent, its own vendor already left out, and each voice's model.
ENABLED="cursor codex claude"
if [ -f "$here/providers.env" ]; then . "$here/providers.env"; fi
provider="all"
model="${CURSOR_MODEL:-cursor-grok-4.6-low}"
# Measured on one commit across six GPT-5.6 model and effort pairs: Sol reported real
# defects at medium and at high, medium in two thirds of the time, Terra reported
# nothing at either, and Luna spent the most tokens of the three. Pinned for this
# run rather than globally, so the account's own settings still stand elsewhere.
codex_model="${CODEX_MODEL:-gpt-6.1-sol}"
codex_effort="${CODEX_EFFORT:-medium}"
claude_model="${CLAUDE_MODEL:-opus}"
claude_effort="${CLAUDE_EFFORT:-high}"
base=""
intent=""

usage() {
  cat <<'USAGE'
Usage: ext-review.sh [--provider cursor|codex|claude|all] [--base <ref>]
                     [--model <slug>] [--intent <text>]

  --provider   Which voices to run. Default: all, meaning every voice config.json
               turns on for this agent and whose CLI is installed.
  --base       Base to review against. Default: origin/HEAD, else main.
  --model      Model for the cursor voice. Default: config.json, else
               cursor-grok-4.6-low.
               `agent models` lists what the account can reach.
  --intent     One sentence on what the change is for. The reviewer challenges
               whether the code achieves it, not whether it is the right goal.

No diff is assembled here. Each provider is told what to review and reads the
repository through its own harness, because two agents that go looking differently
find different defects. That is the whole reason to run more than one.

The voices run at the same time, and each one writes its own file. stdout carries
the paths and nothing else, so a truncated stream can no longer eat a report.

Exit 0 when at least one voice ran, 1 when a provider or snapshot failed,
2 on a bad argument or base ref, 3 when there is nothing to review, 4 when a
requested voice's CLI is not logged in, 127 when no voice could run: none
installed, or every one out of its usage limit.
USAGE
}

need_value() {
  if [ "$2" -lt 2 ]; then
    echo "ext-review: $1 needs a value" >&2
    exit 2
  fi
}

while [ $# -gt 0 ]; do
  case "$1" in
    --provider) need_value "$1" $#; provider="$2"; shift 2 ;;
    --base) need_value "$1" $#; base="$2"; shift 2 ;;
    --model) need_value "$1" $#; model="$2"; shift 2 ;;
    --intent) need_value "$1" $#; intent="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "ext-review: unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
done

case "$provider" in
  cursor|codex|claude) wanted="$provider" ;;
  all)
    wanted="$ENABLED"
    # Claude Code marks its shells with CLAUDECODE. Its copy of providers.env
    # keeps the Claude voice for the other agents that read it, and asks for
    # this check; other agents' copies already leave their own voice out.
    if [ -n "${CHECK_CLAUDECODE:-}" ] && [ -n "${CLAUDECODE:-}" ]; then wanted="$(printf '%s' " $wanted " | sed 's/ claude / /')"; fi
    ;;
  *) echo "ext-review: --provider must be cursor, codex, claude, or all" >&2; exit 2 ;;
esac
if [ -z "${wanted// /}" ]; then
  echo "ext-review: config.json turns every voice off for this agent, so there is no external review." >&2
  exit 127
fi
wants() { case " $wanted " in *" $1 "*) return 0 ;; *) return 1 ;; esac; }

# Child Git commands must not inherit a pointer back to the original object database.
source_excludes="$(git config --path --get core.excludesFile 2>/dev/null || true)"
export ONESHOT_REVIEW_EXCLUDES="${source_excludes:-${XDG_CONFIG_HOME:-$HOME/.config}/git/ignore}"
source_attributes="$(git config --path --get core.attributesFile 2>/dev/null || true)"
export ONESHOT_REVIEW_ATTRIBUTES="${source_attributes:-${XDG_CONFIG_HOME:-$HOME/.config}/git/attributes}"
export ONESHOT_REVIEW_AUTOCRLF="$(git config --get core.autocrlf 2>/dev/null || printf false)"
while IFS= read -r key; do unset "$key"; done < <(compgen -e | sed -n '/^GIT_/p')
export GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=/dev/null
root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$root"
available=""
for voice in $wanted; do
  case "$voice" in cursor) cli=agent ;; codex) cli=codex ;; claude) cli=claude ;; *) echo 'ext-review: invalid generated provider list' >&2; exit 2 ;; esac
  if command -v "$cli" >/dev/null 2>&1; then available="$available $voice";
  else echo "ext-review: no $voice voice, the $cli CLI is not on PATH. Install it to add this reviewer." >&2; fi
done
wanted="${available# }"
if [ -z "$wanted" ]; then echo 'ext-review: no provider CLI is installed.' >&2; exit 127; fi

# A logged-out CLI used to exit non-zero minutes into the run and read as an ordinary
# provider failure, so callers skipped the review. Each status command is checked
# before anything starts, and a logout is its own exit code that only the user can fix.
logged_out=""
for voice in $wanted; do
  case "$voice" in
    cursor) status_cmd="agent status"; login_cmd="agent login" ;;
    codex) status_cmd="codex login status"; login_cmd="codex login" ;;
    claude) status_cmd="claude auth status"; login_cmd="claude auth login" ;;
  esac
  out="$($status_cmd 2>&1)" && ! printf '%s' "$out" | grep -qiE 'not logged in|"loggedIn": *false' && continue
  logged_out="yes"
  echo "ext-review: the $voice CLI is not logged in. Run \`$login_cmd\`, then run the review again." >&2
done
if [ -n "$logged_out" ]; then exit 4; fi

if [ -z "$base" ]; then
  # A repository with no refs/remotes/origin/HEAD makes this command fail, and a
  # failing command substitution aborts the whole script under `set -e`. The
  # fallback below is only reachable with the guard.
  base="$(git rev-parse --abbrev-ref --verify -q origin/HEAD 2>/dev/null || true)"
fi
if [ -z "$base" ]; then base="main"; fi

# The scope is written into a command the reviewer is told to run, and git accepts
# refnames a shell would treat as substitution: `git check-ref-format` says
# `$(id)` is a valid branch name. A remote controls what origin/HEAD points at, so
# the ref is checked before it reaches that string.
case "$base" in
  ""|-*|*[!A-Za-z0-9._/-]*)
    echo "ext-review: refusing base ref '$base', it must match [A-Za-z0-9._/-]" >&2
    exit 2 ;;
esac

if ! git rev-parse --verify --quiet --end-of-options "${base}^{commit}" >/dev/null 2>&1; then
  echo "ext-review: base ref '$base' does not exist" >&2
  exit 2
fi

tmp="${TMPDIR:-/tmp}"
outdir="$(mktemp -d "${tmp%/}/ext-review.XXXXXX")"
snapshot="$outdir/repository"
cleanup() { rm -rf -- "$snapshot"; rmdir "$outdir" 2>/dev/null || true; }
trap cleanup EXIT
rc=0
node "$here/snapshot.mjs" "$root" "$base" "$snapshot" || rc=$?
if [ "$rc" != 0 ]; then rmdir "$outdir" 2>/dev/null || true; exit "$rc"; fi
root="$snapshot"
base="review-base"
unset ONESHOT_REVIEW_EXCLUDES ONESHOT_REVIEW_ATTRIBUTES ONESHOT_REVIEW_AUTOCRLF
cd "$root"

# Emptiness is a question about content, not about commit count. A branch can be
# ahead by commits whose net diff is nothing.
has_committed=""
if ! git diff --quiet "$base"...HEAD 2>/dev/null; then has_committed="yes"; fi
has_local=""
if [ -n "$(git status --porcelain 2>/dev/null)" ]; then has_local="yes"; fi

# The voices share this answer, so it is settled once, before any is spawned.
if [ -z "$has_committed" ] && [ -z "$has_local" ]; then
  echo "ext-review: nothing to review against ${base}" >&2
  exit 3
fi

# ---------------------------------------------------------------- cursor voice

# errexit is off inside a function called from an `||` list, so every exit status
# this function cares about is captured explicitly and returned.
contract() {
  cat "$here/PROMPT.md"
  printf '\n## Intent\n\n%s\n' "${intent:-Not stated. Work it out from the commit messages.}"
  printf '\n## Scope\n\nRepository root: %s\n\n' "$root"
  printf 'Review everything this branch changes against `%s`:\n\n' "$base"
  printf -- "- \`git diff '%s'...HEAD\` for the committed work.\n" "$base"
  printf -- '- `git diff --cached` for staged changes, and `git diff` for working changes.\n'
  printf -- '- `git ls-files --others --exclude-standard` for untracked files, which the\n'
  printf -- '  two commands above never show. Read each one in full.\n\n'
  printf 'Read needed context only inside this sanitized repository. Do not read the original checkout, home directories, credentials or other absolute paths.\n'
}

run_cursor() {
  local rc=0

  printf '===== cursor: %s, this repository'"'"'s review contract =====\n\n' "$model"
  contract | agent -p --trust --mode ask --model "$model" --output-format text || rc=$?
  printf '\n'
  return "$rc"
}

# ---------------------------------------------------------------- claude voice

# Read tools and read-only git only: dontAsk refuses every tool outside the list.
# No settings file loads, the user's or the reviewed checkout's, and no hook runs:
# a default mode or an allow rule could approve a writing command, and a hook
# would run commands of its own.
run_claude() {
  local rc=0

  printf '===== claude: %s, this repository'"'"'s review contract =====\n\n' "$claude_model"
  contract | claude -p --model "$claude_model" --effort "$claude_effort" --output-format text \
    --permission-mode dontAsk --setting-sources "" --settings '{"disableAllHooks":true}' \
    --allowedTools Read Grep Glob "Bash(git diff:*)" "Bash(git log:*)" "Bash(git show:*)" "Bash(git ls-files:*)" "Bash(git status:*)" \
    --disallowedTools Edit Write NotebookEdit || rc=$?
  printf '\n'
  return "$rc"
}

# ----------------------------------------------------------------- codex voice

# `codex review` exits 0 even when it reports findings, so a non-zero status here
# is a real failure and must not be swallowed.
run_codex() {
  local rc=0 one

  if [ -n "$has_committed" ]; then
    printf '===== codex: built-in review, %s..HEAD =====\n\n' "$base"
    one=0
    codex review -c model="$codex_model" -c model_reasoning_effort="$codex_effort" --base "$base" || one=$?
    printf '\n'
    if [ "$one" != "0" ]; then rc="$one"; fi
  fi
  if [ -n "$has_local" ]; then
    printf '===== codex: built-in review, uncommitted and untracked =====\n\n'
    one=0
    codex review -c model="$codex_model" -c model_reasoning_effort="$codex_effort" --uncommitted || one=$?
    printf '\n'
    if [ "$one" != "0" ] && [ "$rc" = "0" ]; then rc="$one"; fi
  fi
  return "$rc"
}

# ------------------------------------------------------------------ dispatcher

ran=0
failed=0
limited=0
missing=""
lines=""

# The reports run to tens of kilobytes. They used to share one stdout, where
# anything that truncated the stream ate the first voice whole, so each one gets
# its own file and stdout carries the paths alone.
# A voice out of its usage limit is skipped, not failed: the run goes on with the
# others. Codex prints "You've hit your usage limit"; Cursor's text comes from its
# server, so the pattern is broader than any one message.
tally() {
  local status
  if [ "$1" = 0 ]; then
    ran=$((ran + 1)); status="ok"
  elif grep -qiE "usage limit|hit your limit|rate limit|quota|resource.?exhausted" "$3"; then
    limited=$((limited + 1)); status="limit"
    echo "ext-review: the $2 voice is out of its usage limit and was skipped, its output is in $3" >&2
  else
    failed=$((failed + 1)); status="exit $1"
    echo "ext-review: the $2 voice exited $1, its output is in $3" >&2
  fi
  lines="$lines
$(printf '%-8s %-9s %s' "$2" "$status" "$3")"
}

# The voices are read-only and share nothing, so they run at once. The wall clock
# is then the slowest of them rather than their sum.
cursor_pid=""
codex_pid=""
claude_pid=""

if wants cursor; then
  if command -v agent >/dev/null 2>&1; then
    run_cursor >"$outdir/cursor.md" 2>&1 &
    cursor_pid=$!
  else
    missing="$missing
ext-review: no cursor voice, the \`agent\` CLI is not on PATH.
            Install the Cursor CLI and run \`agent login\` to add it."
  fi
fi

if wants codex; then
  if command -v codex >/dev/null 2>&1; then
    run_codex >"$outdir/codex.md" 2>&1 &
    codex_pid=$!
  else
    missing="$missing
ext-review: no codex voice, the \`codex\` CLI is not on PATH.
            Install the Codex CLI and run \`codex login\` to add it."
  fi
fi

if wants claude; then
  if command -v claude >/dev/null 2>&1; then
    run_claude >"$outdir/claude.md" 2>&1 &
    claude_pid=$!
  else
    missing="$missing
ext-review: no claude voice, the \`claude\` CLI is not on PATH.
            Install Claude Code and log in to add it."
  fi
fi

if [ -n "$cursor_pid" ]; then rc=0; wait "$cursor_pid" || rc=$?; tally "$rc" cursor "$outdir/cursor.md"; fi
if [ -n "$codex_pid" ]; then rc=0; wait "$codex_pid" || rc=$?; tally "$rc" codex "$outdir/codex.md"; fi
if [ -n "$claude_pid" ]; then rc=0; wait "$claude_pid" || rc=$?; tally "$rc" claude "$outdir/claude.md"; fi

# Only ever empty when no voice was spawned, which is exactly when it is litter.
rmdir "$outdir" 2>/dev/null || true

if [ -n "$missing" ]; then
  printf '%s\n' "$missing" >&2
  if [ "$ran" -gt 0 ]; then
    echo "ext-review: ran $ran of the requested voices. More providers means more independent readers, so install the rest when you can." >&2
  fi
fi

if [ -n "$lines" ]; then
  printf 'ext-review: each voice wrote its own file. Read every one of them in full.\n%s\n' "$lines"
fi

if [ "$failed" -gt 0 ]; then exit 1; fi
if [ "$ran" -gt 0 ]; then exit 0; fi
if [ "$limited" -gt 0 ]; then echo "ext-review: no voice could run, every one is out of its usage limit." >&2
else echo "ext-review: no voice could run. Install at least one provider CLI." >&2; fi
exit 127
