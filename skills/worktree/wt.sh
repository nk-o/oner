#!/usr/bin/env bash
#
# Worktree lifecycle for any git repository: create, inspect, finish, prune.
#
#   wt.sh init            write .claude/worktree.json from what the repo looks like
#   wt.sh new <name>      add a worktree, copy local env files, install, assign a dev port
#   wt.sh adopt [<name>]  bootstrap an app-created worktree; --branch names a detached checkout
#   wt.sh status          every worktree with its port, dev server, and pull request
#   wt.sh ports [<name>]  repair port assignments without installing or bootstrapping
#   wt.sh finish [<name>] merge the pull request and remove branch, worktree, and server
#   wt.sh prune           remove worktrees whose pull request is already merged
#
# `finish` and `prune` print their plan and change nothing until --yes is passed.
#
# Per-repository settings live in .claude/worktree.json at the repository root:
#
#   {
#     "bootstrap": "scripts/bootstrap-worktree.sh",
#     "install": "pnpm install",
#     "copy": [".env.local"],
#     "servers": [
#       {
#         "name": "dashboard",
#         "command": "pnpm dev --port {port}",
#         "portRange": [3102, 3109],
#         "envFile": ".env.local",
#         "envUrlKey": "NEXT_PUBLIC_URL"
#       }
#     ],
#     "checks": ["npm run lint", "npm test"]
#   }
#
# With "bootstrap" set, the repository's own script owns copy and install, and
# this one only assigns ports (.claude/launch.json, written first so the script
# can read them) and calls it. Everything else is optional.

set -euo pipefail

die() { printf '%s\n' "$*" >&2; exit 1; }

command -v git >/dev/null 2>&1 || die "git is required."
command -v jq >/dev/null 2>&1 || die "jq is required (brew install jq)."

git rev-parse --git-dir >/dev/null 2>&1 || die "Not inside a git repository."

PRIMARY="$(git worktree list --porcelain | awk '/^worktree /{print substr($0, 10); exit}')"
HERE="$(git rev-parse --show-toplevel)"
CONFIG="$HERE/.claude/worktree.json"
[ -f "$CONFIG" ] || CONFIG="$PRIMARY/.claude/worktree.json"
WORKTREE_HOME="$PRIMARY/.claude/worktrees"

# --- config ----------------------------------------------------------------

cfg() {
  # cfg <jq-filter> [default]
  local value=""
  if [ -f "$CONFIG" ]; then
    value="$(jq -r "$1 // empty" "$CONFIG" 2>/dev/null || true)"
  fi
  if [ -z "$value" ] && [ $# -gt 1 ]; then
    value="$2"
  fi
  printf '%s' "$value"
}

default_branch() {
  local ref
  ref="$(git -C "$PRIMARY" symbolic-ref --quiet refs/remotes/origin/HEAD 2>/dev/null || true)"
  if [ -n "$ref" ]; then
    basename "$ref"
    return
  fi
  ref="$(git -C "$PRIMARY" remote show origin 2>/dev/null | awk '/HEAD branch/{print $NF; exit}' || true)"
  printf '%s' "${ref:-main}"
}

detect_install() {
  if [ -f "$HERE/pnpm-lock.yaml" ]; then echo "pnpm install"
  elif [ -f "$HERE/yarn.lock" ]; then echo "yarn install"
  elif [ -f "$HERE/bun.lock" ] || [ -f "$HERE/bun.lockb" ]; then echo "bun install"
  elif [ -f "$HERE/package.json" ]; then echo "npm install"
  elif [ -f "$HERE/composer.json" ]; then echo "composer install"
  else echo ""
  fi
}

# Local files git is told to ignore but a new checkout still needs.
detect_copy() {
  git -C "$PRIMARY" ls-files --others --ignored --exclude-standard --directory 2>/dev/null |
    grep -E '(^|/)\.env[^/]*$' |
    grep -v '\.example$' || true
}

detect_checks() {
  [ -f "$HERE/package.json" ] || return 0
  local runner="npm run" key
  case "$(detect_install)" in
    pnpm*) runner="pnpm" ;;
    yarn*) runner="yarn" ;;
    bun*) runner="bun run" ;;
  esac
  for key in lint type-check typecheck test; do
    if jq -e --arg k "$key" '.scripts[$k] // empty' "$HERE/package.json" >/dev/null 2>&1; then
      echo "$runner $key"
    fi
  done
}

# --- ports -----------------------------------------------------------------

is_listening() {
  command -v lsof >/dev/null 2>&1 || return 1
  lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1
}

# Ports written into the launch config of any other checkout.
claimed_ports() {
  local self="$1" dir
  git worktree list --porcelain | awk '/^worktree /{print substr($0, 10)}' |
    while IFS= read -r dir; do
      [ "$dir" = "$self" ] && continue
      [ -f "$dir/.claude/launch.json" ] || continue
      jq -r '.configurations[]?.port // empty' "$dir/.claude/launch.json" 2>/dev/null || true
    done
}

pick_port() {
  local min="$1" max="$2" claimed="$3" candidate
  for ((candidate = min; candidate <= max; candidate++)); do
    if printf '%s\n' "$claimed" | grep -qx "$candidate"; then continue; fi
    if is_listening "$candidate"; then continue; fi
    printf '%s' "$candidate"
    return 0
  done
  die "No free port in ${min}-${max}. Free one, or finish a stale worktree."
}

# Each checkout writes its own launch file; choosing a free port reads them all.
port_lock=""
release_port_lock() {
  local attempt
  [ -n "$port_lock" ] || return 0
  if [ "$(cat "$port_lock/pid" 2>/dev/null)" = "$$" ]; then
    rm -f "$port_lock/pid"
    for ((attempt = 0; attempt < 100; attempt++)); do
      rmdir "$port_lock" 2>/dev/null && break
      [ -d "$port_lock" ] && [ ! -e "$port_lock/pid" ] || break
      sleep 0.01
    done
  fi
  port_lock=""
}

acquire_port_lock() {
  local lock owner attempt cleanup_attempt
  lock="$(git -C "$PRIMARY" rev-parse --path-format=absolute --git-common-dir)/worktree-ports.lock"
  for ((attempt = 0; attempt < 300; attempt++)); do
    if mkdir "$lock" 2>/dev/null; then
      port_lock="$lock"
      printf '%s\n' "$$" > "$lock/pid"
      trap release_port_lock EXIT
      trap 'exit 130' INT
      trap 'exit 143' TERM
      return 0
    fi
    owner="$(cat "$lock/pid" 2>/dev/null || true)"
    if [[ "$owner" =~ ^[0-9]+$ ]] && ! kill -0 "$owner" 2>/dev/null && mkdir "$lock/reap" 2>/dev/null; then
      owner="$(cat "$lock/pid" 2>/dev/null || true)"
      if [[ "$owner" =~ ^[0-9]+$ ]] && ! kill -0 "$owner" 2>/dev/null; then
        rm -f "$lock/pid"
      fi
      rmdir "$lock/reap" 2>/dev/null || true
      for ((cleanup_attempt = 0; cleanup_attempt < 100; cleanup_attempt++)); do
        rmdir "$lock" 2>/dev/null && break
        [ -d "$lock" ] && [ ! -e "$lock/pid" ] || break
        sleep 0.01
      done
    fi
    sleep 0.1
  done
  die "Port allocation is busy: $lock. Retry after the other bootstrap finishes."
}

port_belongs_to() {
  local port="$1" dir="$2" cwd pid checkout
  while IFS= read -r pid; do
    [ -n "$pid" ] || continue
    cwd="$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p')"
    case "$cwd/" in "$dir/"*) : ;; *) return 1 ;; esac
    while IFS= read -r checkout; do
      [ "$checkout" = "$dir" ] && continue
      case "$checkout/" in
        "$dir/"*) case "$cwd/" in "$checkout/"*) return 1 ;; esac ;;
      esac
    done < <(git worktree list --porcelain | awk '/^worktree /{print substr($0, 10)}')
  done < <(lsof -nP -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)
}

set_env_var() {
  local file="$1" key="$2" value="$3" tmp
  [ -f "$file" ] || return 0
  tmp="$(mktemp)"
  if grep -qE "^${key}=" "$file"; then
    awk -v k="$key" -v v="$value" 'index($0, k "=") == 1 { print k "=" v; next } { print }' "$file" >"$tmp"
  else
    cp "$file" "$tmp"
    printf '%s=%s\n' "$key" "$value" >>"$tmp"
  fi
  mv "$tmp" "$file"
}

# --- pull requests ---------------------------------------------------------

PR_CACHE=""

load_prs() {
  [ -n "$PR_CACHE" ] && return 0
  if ! command -v gh >/dev/null 2>&1; then
    PR_CACHE="[]"
    return 0
  fi
  PR_CACHE="$(gh pr list --state all --limit 100 \
    --json number,headRefName,headRefOid,state,reviewDecision,mergeStateStatus,statusCheckRollup \
    2>/dev/null || echo '[]')"
}

# True when every commit on the worktree's HEAD is in the pull request's head, so
# removing the local branch loses nothing. A head GitHub moved ahead (Update branch,
# a bot commit) still counts; the head is fetched first in case it is not local.
pr_carries_head() {
  local dir="$1" pr="$2" oid number
  oid="$(printf '%s' "$pr" | jq -r '.headRefOid // empty')"
  number="$(printf '%s' "$pr" | jq -r '.number // empty')"
  [ -n "$oid" ] || return 1
  git -C "$dir" cat-file -e "$oid^{commit}" 2>/dev/null ||
    git -C "$dir" fetch --quiet origin "refs/pull/$number/head" 2>/dev/null || true
  git -C "$dir" merge-base --is-ancestor HEAD "$oid" 2>/dev/null
}

pr_for_branch() {
  load_prs
  printf '%s' "$PR_CACHE" | jq -c --arg b "$1" 'map(select(.headRefName == $b)) | first // empty'
}

# "#12 OPEN checks:pass review:APPROVED", one line, for the status table.
pr_summary() {
  local pr="$1"
  [ -z "$pr" ] && { printf '%s' "-"; return; }
  printf '%s' "$pr" | jq -r '
    def checks:
      if (.statusCheckRollup // []) | length == 0 then "none"
      elif [.statusCheckRollup[] | (.conclusion // .state // "")] | any(. == "FAILURE" or . == "ERROR" or . == "TIMED_OUT") then "FAIL"
      elif [.statusCheckRollup[] | (.conclusion // .state // "")] | any(. == "" or . == "PENDING" or . == "IN_PROGRESS") then "running"
      else "pass" end;
    "#\(.number) \(.state) checks:\(checks) review:\(if (.reviewDecision // "") == "" then "-" else .reviewDecision end)"'
}

# --- worktree helpers ------------------------------------------------------

worktree_dirs() {
  git worktree list --porcelain | awk '/^worktree /{print substr($0, 10)}' | grep -v "^${PRIMARY}$" || true
}

branch_of() {
  git -C "$1" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "(detached)"
}

resolve_worktree() {
  # By name, by path, or the current one when nothing is given.
  local target="${1:-}" dir
  if [ -z "$target" ]; then
    dir="$(git rev-parse --show-toplevel)"
    [ "$dir" = "$PRIMARY" ] && die "Run this from inside a worktree, or pass its name."
    printf '%s' "$dir"
    return
  fi
  [ -d "$target" ] && { cd "$target" && pwd -P; return; }
  [ -d "$WORKTREE_HOME/$target" ] && { printf '%s' "$WORKTREE_HOME/$target"; return; }
  while IFS= read -r dir; do
    [ -z "$dir" ] && continue
    if [ "$(branch_of "$dir")" = "$target" ]; then printf '%s' "$dir"; return; fi
  done <<EOF
$(worktree_dirs)
EOF
  die "No worktree named '$target'. Run: wt.sh status"
}

delete_remote_branch() {
  local branch="$1"
  git -C "$PRIMARY" ls-remote --exit-code --heads origin "$branch" >/dev/null 2>&1 || return 0
  git -C "$PRIMARY" push origin --delete "$branch" >/dev/null 2>&1 &&
    echo "  deleted remote branch $branch"
}

stop_servers() {
  local dir="$1" port pid
  [ -f "$dir/.claude/launch.json" ] || return 0
  jq -r '.configurations[]?.port // empty' "$dir/.claude/launch.json" 2>/dev/null |
    while IFS= read -r port; do
      [ -z "$port" ] && continue
      is_listening "$port" || continue
      port_belongs_to "$port" "$dir" || continue
      for pid in $(lsof -ti tcp:"$port" -sTCP:LISTEN 2>/dev/null || true); do
        local cwd
        cwd="$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p')"
        case "$cwd/" in "$dir/"*) : ;; *) continue ;; esac
        kill "$pid" 2>/dev/null && echo "  stopped dev server on port $port (pid $pid)" || true
      done
    done
}

# --- commands --------------------------------------------------------------

cmd_init() {
  CONFIG="$HERE/.claude/worktree.json"
  [ -f "$CONFIG" ] && die "$CONFIG already exists."
  local install bootstrap copy_json checks_json
  bootstrap=""
  [ -x "$HERE/scripts/bootstrap-worktree.sh" ] && bootstrap="scripts/bootstrap-worktree.sh"
  install=""
  copy_json="[]"
  if [ -z "$bootstrap" ]; then
    install="$(detect_install)"
    copy_json="$(detect_copy | jq -R . | jq -s 'map(select(length > 0))')"
  fi
  checks_json="$(detect_checks | jq -R . | jq -s 'map(select(length > 0))')"

  mkdir -p "$HERE/.claude"
  jq -n \
    --arg bootstrap "$bootstrap" \
    --arg install "$install" \
    --argjson copy "$copy_json" \
    --argjson checks "$checks_json" \
    '{bootstrap: $bootstrap, install: $install, copy: $copy, servers: [], checks: $checks}
     | with_entries(select(.value != "" and .value != null and .value != []))' >"$CONFIG"

  echo "Wrote $CONFIG:"
  cat "$CONFIG"
  echo
  echo "Add \"servers\" so new worktrees get a dev port, and \"checks\" for the pre-PR gate."
}

# True when every ranged server in the launch config has a port inside its range
# that no other checkout claims. The Claude app copies the primary checkout's
# .claude/ into worktrees, so a launch config can be present without being ours.
launch_config_is_own() {
  local file="$1" servers="$2" claimed="$3" i count sname smin smax port
  count="$(printf '%s' "$servers" | jq 'length')"
  for ((i = 0; i < count; i++)); do
    sname="$(printf '%s' "$servers" | jq -r ".[$i].name // \"dev\"")"
    smin="$(printf '%s' "$servers" | jq -r ".[$i].portRange[0] // empty")"
    smax="$(printf '%s' "$servers" | jq -r ".[$i].portRange[1] // empty")"
    { [ -z "$smin" ] || [ -z "$smax" ]; } && continue
    [ -n "$(printf '%s' "$servers" | jq -r ".[$i].command // empty")" ] || continue
    port="$(jq -r --arg n "$sname" 'first(.configurations[]? | select(.name == $n) | .port) // empty' "$file" 2>/dev/null || true)"
    [ -n "$port" ] && [ "$port" -ge "$smin" ] && [ "$port" -le "$smax" ] || return 1
    printf '%s\n' "$claimed" | grep -qx "$port" && return 1
    port_belongs_to "$port" "$(dirname "$(dirname "$file")")" || return 1
    claimed="$(printf '%s\n%s' "$claimed" "$port")"
  done
  return 0
}

# Assigns a port to each configured server and writes the launch config the
# editor starts previews from. Configurations no server declares are kept,
# unless another checkout claims their port, as in a copy of the primary's file.
# No-op for a repo that declares no servers.
write_launch_config() {
  local dir="$1" servers configs="[]" claimed
  servers="$(cfg '.servers')"
  [ -z "$servers" ] || [ "$servers" = "null" ] && return 0

  command -v lsof >/dev/null 2>&1 || die "lsof is required to assign dev ports."
  acquire_port_lock
  local released
  released="$(git -C "$dir" rev-parse --absolute-git-dir)/launch.released.json"
  if [ ! -f "$dir/.claude/launch.json" ] && [ -f "$released" ]; then
    mkdir -p "$dir/.claude"
    cp "$released" "$dir/.claude/launch.json"
  fi
  claimed="$(claimed_ports "$dir")"
  if [ -f "$dir/.claude/launch.json" ]; then
    if launch_config_is_own "$dir/.claude/launch.json" "$servers" "$claimed"; then
      echo "  ports   kept, .claude/launch.json already present"
      release_port_lock
      return 0
    fi
    echo "  ports   .claude/launch.json has a port outside its range or used by another checkout, reassigning"
  fi

  local i count server sname scommand smin smax sport senv skey
  count="$(printf '%s' "$servers" | jq 'length')"
  for ((i = 0; i < count; i++)); do
    server="$(printf '%s' "$servers" | jq -c ".[$i]")"
    sname="$(printf '%s' "$server" | jq -r '.name // "dev"')"
    scommand="$(printf '%s' "$server" | jq -r '.command // empty')"
    [ -z "$scommand" ] && continue
    smin="$(printf '%s' "$server" | jq -r '.portRange[0] // empty')"
    smax="$(printf '%s' "$server" | jq -r '.portRange[1] // empty')"
    sport=""
    if [ -n "$smin" ] && [ -n "$smax" ]; then
      if [ -f "$dir/.claude/launch.json" ]; then
        sport="$(jq -r --arg n "$sname" 'first(.configurations[]? | select(.name == $n) | .port) // empty' "$dir/.claude/launch.json")"
      fi
      if ! [[ "$sport" =~ ^[0-9]+$ ]] || [ "$sport" -lt "$smin" ] || [ "$sport" -gt "$smax" ] ||
        printf '%s\n' "$claimed" | grep -qx "$sport" || ! port_belongs_to "$sport" "$dir"; then
        sport="$(pick_port "$smin" "$smax" "$claimed")"
      fi
      claimed="$(printf '%s\n%s' "$claimed" "$sport")"
      scommand="${scommand//\{port\}/$sport}"
      senv="$(printf '%s' "$server" | jq -r '.envFile // empty')"
      skey="$(printf '%s' "$server" | jq -r '.envUrlKey // empty')"
      if [ -n "$senv" ] && [ -n "$skey" ]; then
        set_env_var "$dir/$senv" "$skey" "http://127.0.0.1:${sport}"
      fi
      echo "  port    $sname → $sport"
    fi
    configs="$(printf '%s' "$configs" | jq \
      --arg name "$sname" --arg cmd "$scommand" --arg port "$sport" \
      '. + [{
         name: $name,
         runtimeExecutable: ($cmd | split(" ")[0]),
         runtimeArgs: ($cmd | split(" ")[1:])
       } + (if $port == "" then {} else {port: ($port | tonumber)} end)]')"
  done

  if [ -f "$dir/.claude/launch.json" ]; then
    configs="$(jq --argjson own "$configs" \
      --argjson taken "$(printf '%s\n' "$claimed" | jq -R 'select(length > 0) | tonumber? // empty' | jq -s .)" \
      '$own + [.configurations[]? | select(.name as $n | $own | map(.name) | index($n) | not)
        | select(.port == null or (.port as $p | $taken | index($p) | not))]' \
      "$dir/.claude/launch.json" 2>/dev/null || printf '%s' "$configs")"
  fi

  if [ "$(printf '%s' "$configs" | jq 'length')" -gt 0 ]; then
    mkdir -p "$dir/.claude"
    printf '%s' "$configs" | jq '{version: "0.0.1", configurations: .}' >"$dir/.claude/launch.json"
    echo "  wrote   .claude/launch.json"
  fi
  release_port_lock
}

# Everything a checkout needs beyond git: env copies, ports, install. Shared by
# `new` (fresh worktree) and `adopt` (a worktree made by the app or by hand).
bootstrap_worktree() {
  local dir="$1" run_install="$2"
  local bootstrap bootstrap_args=""
  bootstrap="$(cfg '.bootstrap')"
  if [ -n "$bootstrap" ]; then
    write_launch_config "$dir"
    if [ -x "$dir/$bootstrap" ]; then
      [ "$run_install" = false ] && bootstrap_args="--no-install"
      echo "Bootstrapping with ${bootstrap}…"
      ( cd "$dir" && "./$bootstrap" $bootstrap_args )
    else
      [ "$run_install" = false ] &&
        echo "Note: --no-install does not apply to a command bootstrap."
      echo "Bootstrapping with: $bootstrap"
      ( cd "$dir" && eval "$bootstrap" )
    fi
    return
  fi

  local file
  while IFS= read -r file; do
    [ -z "$file" ] && continue
    if [ -f "$PRIMARY/$file" ] && [ ! -f "$dir/$file" ]; then
      mkdir -p "$(dirname "$dir/$file")"
      cp "$PRIMARY/$file" "$dir/$file"
      echo "  copied  $file"
    fi
  done <<EOF
$(cfg '.copy[]?')
EOF

  write_launch_config "$dir"

  local install
  install="$(cfg '.install' "$(detect_install)")"
  if [ "$run_install" = true ] && [ -n "$install" ]; then
    echo
    echo "Installing dependencies ($install)…"
    ( cd "$dir" && eval "$install" )
  fi
}

cmd_adopt() {
  local target="" branch="" run_install=true
  while [ $# -gt 0 ]; do
    case "$1" in
      --branch) branch="${2:-}"; shift 2 ;;
      --no-install) run_install=false; shift ;;
      -*) die "Unknown option: $1" ;;
      *) target="$1"; shift ;;
    esac
  done

  local dir
  dir="$(resolve_worktree "$target")"
  [ "$dir" = "$PRIMARY" ] && die "This is the primary checkout; adopt runs on worktrees."
  [ -f "$CONFIG" ] || die "No .claude/worktree.json. Run the worktree-setup skill first."

  local current_branch
  current_branch="$(branch_of "$dir")"
  if [ "$current_branch" = "HEAD" ]; then
    [ -n "$branch" ] || die "Detached worktree: pass --branch <name>."
    git -C "$dir" switch -c "$branch"
  elif [ -n "$branch" ] && [ "$branch" != "$current_branch" ]; then
    die "Worktree is already on $current_branch; refusing --branch $branch."
  fi

  echo "Adopting $dir"
  bootstrap_worktree "$dir" "$run_install"
  echo
  echo "Worktree ready: $dir (branch $(branch_of "$dir"))"
}

cmd_new() {
  local name="${1:-}" branch="" base=""
  [ -z "$name" ] && die "Usage: wt.sh new <name> [--branch <branch>] [--no-install]"
  shift
  local run_install=true
  while [ $# -gt 0 ]; do
    case "$1" in
      --branch) branch="${2:-}"; shift 2 ;;
      --no-install) run_install=false; shift ;;
      *) die "Unknown option: $1" ;;
    esac
  done
  branch="${branch:-$name}"
  base="$(default_branch)"

  local dir="$WORKTREE_HOME/$name"
  [ -e "$dir" ] && die "$dir already exists. If an earlier 'new' stopped halfway, finish it with: wt.sh adopt '$dir'"

  if ! git -C "$PRIMARY" check-ignore -q ".claude/worktrees/$name" 2>/dev/null; then
    echo "Warning: .claude/worktrees/ is not in .gitignore, so the new worktree will show up as untracked."
  fi

  git -C "$PRIMARY" fetch origin --quiet
  git -C "$PRIMARY" worktree add --no-track "$dir" -b "$branch" "origin/$base"
  echo

  bootstrap_worktree "$dir" "$run_install"

  echo
  echo "Worktree ready: $dir (branch $branch, based on origin/$base)"
}

cmd_ports() {
  local dir
  dir="$(resolve_worktree "${1:-}")"
  [ "$dir" != "$PRIMARY" ] || die "This is the primary checkout; ports runs on worktrees."
  write_launch_config "$dir"
}

cmd_status() {
  local dir name branch dirty ahead ports pr
  # Filled in this shell, because a cache filled inside $(...) or the pipe below is lost with it.
  load_prs
  {
  printf 'WORKTREE|BRANCH|CHANGES|AHEAD|DEV|PR\n'
  while IFS= read -r dir; do
    [ -z "$dir" ] && continue
    name="$(basename "$dir")"
    branch="$(branch_of "$dir")"
    dirty="$(git -C "$dir" status --porcelain 2>/dev/null | wc -l | tr -d ' ')"
    ahead="$(git -C "$dir" rev-list --count "origin/$(default_branch)..HEAD" 2>/dev/null || echo "?")"
    ports="-"
    if [ -f "$dir/.claude/launch.json" ]; then
      ports=""
      while IFS= read -r p; do
        [ -z "$p" ] && continue
        if is_listening "$p"; then ports="${ports}${p}:up "; else ports="${ports}${p}:down "; fi
      done <<EOF
$(jq -r '.configurations[]?.port // empty' "$dir/.claude/launch.json" 2>/dev/null)
EOF
      [ -z "$ports" ] && ports="-"
    fi
    pr="$(pr_summary "$(pr_for_branch "$branch")")"
    printf '%s|%s|%s|%s|%s|%s\n' "$name" "$branch" "$dirty" "$ahead" "${ports% }" "$pr"
  done <<EOF
$(worktree_dirs)
EOF
  } | column -t -s '|'
}

cmd_finish() {
  local target="" confirm=false strategy="squash"
  while [ $# -gt 0 ]; do
    case "$1" in
      --yes) confirm=true; shift ;;
      --merge) strategy="${2:-squash}"; shift 2 ;;
      -*) die "Unknown option: $1" ;;
      *) target="$1"; shift ;;
    esac
  done

  local dir branch pr state
  dir="$(resolve_worktree "$target")"
  branch="$(branch_of "$dir")"
  pr="$(pr_for_branch "$branch")"

  local dirty
  dirty="$(git -C "$dir" status --porcelain | wc -l | tr -d ' ')"
  [ "$dirty" != "0" ] && die "$dir has $dirty uncommitted change(s). Commit or discard them first."

  [ -z "$pr" ] && die "No pull request for branch '$branch'. Open one first."
  state="$(printf '%s' "$pr" | jq -r '.state')"

  # Deleting the branch after the merge takes every commit the pull request does not carry.
  pr_carries_head "$dir" "$pr" ||
    die "$branch has commits its pull request does not carry. Push or discard them first."

  # Removing the directory we are standing in would break the shell; leave it
  # for `wt.sh prune` from another checkout.
  local inside=false
  case "$PWD/" in "$dir/"*) inside=true ;; esac

  echo "Worktree : $dir"
  echo "Branch   : $branch"
  echo "PR       : $(pr_summary "$pr")"
  echo "Plan     :"
  [ "$state" = "OPEN" ] && echo "  - merge the pull request ($strategy) and delete the remote branch"
  [ "$state" = "MERGED" ] && echo "  - already merged; skip the merge"
  [ "$state" = "CLOSED" ] && die "PR is closed without merging. Remove the worktree by hand if that was deliberate."
  echo "  - stop the dev server(s) of this worktree"
  if [ "$inside" = true ]; then
    echo "  - keep the directory (this shell is inside it); run 'wt.sh prune' afterwards"
  else
    echo "  - remove the worktree directory and its local branch"
  fi

  if [ "$confirm" != true ]; then
    echo
    echo "Nothing changed. Re-run with --yes to execute."
    return 0
  fi

  echo
  if [ "$state" = "OPEN" ]; then
    gh pr merge "$(printf '%s' "$pr" | jq -r '.number')" "--$strategy"
  fi
  stop_servers "$dir"

  if [ "$inside" = false ]; then
    git -C "$PRIMARY" worktree remove "$dir"
    git -C "$PRIMARY" worktree prune
    git -C "$PRIMARY" branch -D "$branch" 2>/dev/null || true
    delete_remote_branch "$branch"
    echo "  removed $dir"
  fi
  git -C "$PRIMARY" fetch --prune --quiet
  echo "Done."
}

cmd_prune() {
  local confirm=false
  [ "${1:-}" = "--yes" ] && confirm=true

  local dir branch pr state dirty found=0
  load_prs
  while IFS= read -r dir; do
    [ -z "$dir" ] && continue
    branch="$(branch_of "$dir")"
    pr="$(pr_for_branch "$branch")"
    [ -z "$pr" ] && continue
    state="$(printf '%s' "$pr" | jq -r '.state')"
    [ "$state" != "MERGED" ] && continue
    dirty="$(git -C "$dir" status --porcelain | wc -l | tr -d ' ')"
    if [ "$dirty" != "0" ]; then
      echo "skip   $(basename "$dir"): merged, but has $dirty uncommitted change(s)"
      continue
    fi
    if ! pr_carries_head "$dir" "$pr"; then
      echo "skip   $(basename "$dir"): merged, but has commits the pull request did not carry"
      continue
    fi
    case "$PWD/" in "$dir/"*) echo "skip   $(basename "$dir"): this shell is inside it"; continue ;; esac
    found=$((found + 1))
    if [ "$confirm" = true ]; then
      stop_servers "$dir"
      git -C "$PRIMARY" worktree remove "$dir"
      git -C "$PRIMARY" branch -D "$branch" 2>/dev/null || true
      delete_remote_branch "$branch"
      echo "removed $(basename "$dir") ($branch, PR merged)"
    else
      echo "would remove $(basename "$dir") ($branch, PR merged)"
    fi
  done <<EOF
$(worktree_dirs)
EOF

  if [ "$found" = "0" ]; then
    echo "Nothing to prune."
    return 0
  fi
  if [ "$confirm" != true ]; then
    echo
    echo "Nothing changed. Re-run with --yes to execute."
    return 0
  fi
  git -C "$PRIMARY" worktree prune
  git -C "$PRIMARY" fetch --prune --quiet
}

case "${1:-}" in
  init)   shift; cmd_init "$@" ;;
  new)    shift; cmd_new "$@" ;;
  adopt)  shift; cmd_adopt "$@" ;;
  ports)  shift; cmd_ports "$@" ;;
  status) shift; cmd_status "$@" ;;
  finish) shift; cmd_finish "$@" ;;
  prune)  shift; cmd_prune "$@" ;;
  ""|-h|--help) sed -n '2,31p' "$0" | sed 's/^# \{0,1\}//' ;;
  *) die "Unknown command: $1. Run: wt.sh --help" ;;
esac
