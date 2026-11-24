#!/usr/bin/env bash
# Second judge for a prototype arena: Codex scores candidate screenshots against a rubric,
# read-only. Prints the verdict path, or one line starting skip: or fail:.
set -u

if [ "$#" -lt 3 ]; then
  echo 'Usage: arena-judge.sh <rubric.md> <verdict.md> <screenshot>...' >&2
  exit 2
fi
rubric="$1"
verdict="$2"
shift 2

here="$(cd "$(dirname "$0")" && pwd)"
ENABLED=''
CODEX_MODEL='gpt-6.2-sol'
CODEX_EFFORT='high'
CODEX_TIMEOUT='900'
if [ -f "$here/../external-review/providers.env" ]; then . "$here/../external-review/providers.env"; fi

case " $ENABLED " in
  *' codex '*) ;;
  *) echo 'skip: codex is off in externalReview, or this session is Codex'; exit 0 ;;
esac
if ! command -v codex >/dev/null 2>&1; then
  echo 'skip: the codex CLI is not on PATH'
  exit 0
fi
[ -f "$rubric" ] || { echo "fail: no rubric at $rubric"; exit 1; }
images=()
for shot in "$@"; do
  [ -f "$shot" ] || { echo "fail: no screenshot at $shot"; exit 1; }
  images+=("--image=$shot")
done

prompt="You judge UI candidates from their screenshots alone. Each file name ends in the candidate's letter.
For every candidate and every criterion below, answer met or not met with one line of evidence you can point to in the image.
Then name the candidate you recommend as the base and why. Do not run commands or edit files.

$(cat "$rubric")"

log="$verdict.log"
rm -f "$verdict"
codex exec --sandbox read-only --skip-git-repo-check --ephemeral \
  -m "$CODEX_MODEL" -c model_reasoning_effort="$CODEX_EFFORT" \
  "${images[@]}" -o "$verdict" -- "$prompt" >"$log" 2>&1 &
pid=$!
( sleep "$CODEX_TIMEOUT"; kill "$pid" 2>/dev/null ) &
watch=$!
wait "$pid"
rc=$?
kill "$watch" 2>/dev/null
wait "$watch" 2>/dev/null

if [ "$rc" -eq 0 ] && [ -s "$verdict" ]; then
  echo "$verdict"
else
  echo "fail: codex exited $rc without a verdict, its output is in $log"
  exit 1
fi
