#!/usr/bin/env bash
# Second judge for a prototype arena: Codex scores candidate screenshots against a rubric.
# It runs in an empty directory holding only copies of the screenshots, with no shell tool,
# apps, or plugins, so it receives the rubric and the images and nothing from the project.
# Prints the verdict path, or one line starting skip: or fail:.
set -u

if [ "$#" -lt 3 ]; then
  echo 'Usage: arena-judge.sh <rubric.md> <verdict.md> <name>-<letter>.png...' >&2
  exit 2
fi
rubric="$1"
verdict="$2"
shift 2

here="$(cd "$(dirname "$0")" && pwd)"
ENABLED=''
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

tmp="${TMPDIR:-/tmp}"
work="$(mktemp -d "${tmp%/}/arena-judge.XXXXXX")"
trap 'rm -rf "$work"' EXIT
images=()
letters=''
for shot in "$@"; do
  [ -f "$shot" ] || { echo "fail: no screenshot at $shot"; exit 1; }
  name="$(basename "$shot")"
  letter="$(printf '%s' "${name%.*}" | sed -n 's/.*-\([a-z]\)$/\1/p')"
  [ -n "$letter" ] || { echo "fail: $name does not end in -<letter>"; exit 1; }
  cp "$shot" "$work/$name"
  images+=("--image=$work/$name")
  letters="$letters$letter"
done

prompt="You judge UI candidates from their screenshots alone. Each file name ends in the candidate's letter.
For every candidate and every criterion below, answer met or not met with one line of evidence you can point to in the image.
End with one line: Base: <letter>, naming the candidate you recommend as the base.

$(cat "$rubric")"

log="$verdict.log"
answer="$work/answer.md"
rm -f "$verdict"
set -m
codex exec -C "$work" --sandbox read-only --skip-git-repo-check --ephemeral \
  --disable shell_tool --disable apps --disable plugins \
  -m "$CODEX_MODEL" -c model_reasoning_effort="$CODEX_EFFORT" \
  "${images[@]}" -o "$answer" -- "$prompt" </dev/null >"$log" 2>&1 &
pid=$!
set +m
# Polling, not one long sleep: a sleeping child would hold the caller's pipes for the whole budget.
(
  for ((i = 0; i < CODEX_TIMEOUT; i++)); do
    kill -0 "$pid" 2>/dev/null || exit 0
    sleep 1
  done
  kill -TERM -- "-$pid" 2>/dev/null
  sleep 5
  kill -KILL -- "-$pid" 2>/dev/null
) </dev/null >/dev/null 2>&1 &
wait "$pid"
rc=$?

if [ "$rc" -eq 0 ] && grep -qiE "^[*_ ]*base[*_ ]*:[*_ ]*[$letters]([^a-z]|$)" "$answer" 2>/dev/null; then
  cp "$answer" "$verdict"
  echo "$verdict"
else
  [ -f "$answer" ] && cp "$answer" "$verdict.partial"
  echo "fail: codex exited $rc without a verdict naming a base among $letters, its output is in $log"
  exit 1
fi
