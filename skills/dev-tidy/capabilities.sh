report_capabilities() {
  local git_ready=false docker_state=absent wp_state=absent wp_home="${WP_ENV_HOME:-$HOME/.wp-env}" output
  local root found_root=false
  printf 'module\tstatus\tevidence\n'
  if [ ${#roots[@]} -gt 0 ]; then
    for root in "${roots[@]}"; do
      [ ! -d "$root" ] || found_root=true
    done
  fi
  if command -v git >/dev/null 2>&1; then
    git_ready=true
    if command -v gh >/dev/null 2>&1; then
      printf 'git\tavailable\tGit and GitHub CLI detected; preview validates authentication and completion\n'
    else
      printf 'git\tblocked\tGitHub CLI missing; Git cleanup cannot establish PR completion\n'
    fi
  else
    printf 'git\tabsent\tGit not installed\n'
  fi
  if [ "$found_root" = true ]; then
    printf 'roots\tavailable\tProject search roots detected; --root selects another location\n'
  else
    printf 'roots\tabsent\tNo conventional project roots; use --root for projects elsewhere\n'
  fi
  if [ -d "$T3_HOME" ]; then
    if ! command -v python3 >/dev/null 2>&1 || [ ! -f "$T3_HELPER" ]; then
      printf 't3\tblocked\tT3 data detected but Python 3 or state helper missing\n'
    elif [ ! -r "$T3_HOME/userdata/statev2.sqlite" ]; then
      printf 't3\tunknown\tT3 data detected without readable task state; preserve managed work\n'
    elif [ "$(python3 "$T3_HELPER" capability 2>/dev/null)" = available ]; then
      printf 't3\tavailable\tReadable T3 task state; inspect native retention before cache reclamation\n'
    else
      printf 't3\tunknown\tT3 task state could not be validated; preserve managed work\n'
    fi
  else
    printf 't3\tabsent\tNo T3 data directory\n'
  fi
  if [ "$git_ready" = true ] && [ "$found_root" = true ]; then
    printf 'turbo\tavailable\tGit project roots can be checked for old Turborepo cache\n'
  else
    printf 'turbo\tblocked\tRequires Git and project roots\n'
  fi
  if command -v docker >/dev/null 2>&1; then
    docker_state=blocked
    if docker info >/dev/null 2>&1; then docker_state=available; fi
  fi
  printf 'docker\t%s\t' "$docker_state"
  case "$docker_state" in
    available) printf 'Docker engine reachable; preview checks unused images and build cache\n' ;;
    blocked) printf 'Docker CLI detected but engine unavailable\n' ;;
    absent) printf 'Docker CLI not installed\n' ;;
  esac
  [ ! -d "$wp_home" ] || wp_state=detected
  if [ "$docker_state" = available ]; then
    if output="$(docker ps -a --format '{{.Names}} {{.Label "com.docker.compose.project"}} {{.Label "com.docker.compose.project.working_dir"}}' 2>/dev/null)"; then
      case "$output" in (*wp-env*|*"$wp_home"*) wp_state=detected ;; esac
    else
      wp_state=unknown
    fi
    if output="$(docker images --format '{{.Repository}}' 2>/dev/null)"; then
      case "$output" in (*wp-env-*|*wordpress*) wp_state=detected ;; esac
    else
      wp_state=unknown
    fi
  elif [ "$wp_state" = absent ] && [ "$docker_state" = blocked ]; then
    wp_state=unknown
  fi
  case "$wp_state" in
    detected)
      if [ "$docker_state" = available ]; then
        printf 'wp-env\tavailable\tWordPress runtime directory or Docker resources detected\n'
      else
        printf 'wp-env\tblocked\tWordPress runtime directory detected; Docker engine required\n'
      fi ;;
    unknown) printf 'wp-env\tunknown\tDocker resources could not be inspected\n' ;;
    absent) printf 'wp-env\tabsent\tNo WordPress runtime directory or recognizable Docker resources\n' ;;
  esac
  if [ "$(uname -s)" = Darwin ]; then
    if command -v python3 >/dev/null 2>&1; then
      printf 'chrome-clones\tavailable\tmacOS and Python 3 detected; preview validates native references and clones\n'
    else
      printf 'chrome-clones\tblocked\tmacOS Chrome clone inspection requires Python 3\n'
    fi
  else
    printf 'chrome-clones\tabsent\tChrome code-sign clones are a macOS artifact\n'
  fi
}
