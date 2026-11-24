#!/usr/bin/env bash
set -euo pipefail
git init -q -b main
git config user.email eval@example.invalid
git config user.name eval
cat > README.md <<'EOF'
# Editor plugins workspace

This workspace holds the three plugins we ship for our desktop text editor. Each plugin under
`plugins/<name>/` is its own git repository with its own version and its own release, published
separately to the plugin catalog.

Every plugin carries its own copy of `src/updater.js`, which reads the plugin's release feed and
installs a newer version when one is out. The copies have drifted apart over time.
EOF
cat > .gitignore <<'EOF'
plugins/
EOF
git add -A
git commit -qm "docs: describe the plugins workspace"

plugin() {
  local name=$1 version=$2 timeout=$3
  mkdir -p "plugins/$name/src"
  (
    cd "plugins/$name"
    git init -q -b main
    git config user.email eval@example.invalid
    git config user.name eval
    cat > package.json <<EOF
{
  "name": "editor-plugin-$name",
  "version": "$version",
  "type": "module",
  "main": "src/index.js"
}
EOF
    cat > src/updater.js <<EOF
const FEED = 'https://updates.example.invalid/$name/feed.json';

export async function checkForUpdate(current, fetchImpl = fetch) {
  const res = await fetchImpl(FEED, { signal: AbortSignal.timeout($timeout) });
  if (!res.ok) return null;
  const feed = await res.json();
  return feed.latest !== current ? feed.latest : null;
}
EOF
    cat > src/index.js <<EOF
import { checkForUpdate } from './updater.js';

export async function activate(host) {
  const next = await checkForUpdate('$version');
  if (next) host.notify('Доступна версия ' + next);
}
EOF
    git add -A
    git commit -qm "feat: first release"
  )
}
plugin word-count 1.4.0 5000
plugin spell-hints 2.1.3 10000
plugin table-tools 0.9.1 3000
