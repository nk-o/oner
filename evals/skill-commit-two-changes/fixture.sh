#!/usr/bin/env bash
set -euo pipefail
git init -q -b main
git config user.email eval@example.invalid
git config user.name eval
mkdir -p src

cat > src/cart.js <<'EOF'
export function totalCents(items) {
  return items.reduce((sum, item) => sum + item.price * 100 * item.qty, 0);
}
EOF
git add -A
git commit -qm "feat(cart): add cart total in cents"

cat > src/search.js <<'EOF'
export const DEFAULT_PAGE_SIZE = 20;

export function search(index, query, { pageSize = DEFAULT_PAGE_SIZE } = {}) {
  const q = query.trim().toLowerCase();
  return index.filter((doc) => doc.title.toLowerCase().includes(q)).slice(0, pageSize);
}
EOF
git add -A
git commit -qm "feat(search): add title search"

cat > src/cart.js <<'EOF'
export function totalCents(items) {
  return items.reduce((sum, item) => sum + Math.round(item.price * 100) * item.qty, 0);
}
EOF
cat > src/search.js <<'EOF'
export const DEFAULT_PAGE_SIZE = 50;

export function search(index, query, { pageSize = DEFAULT_PAGE_SIZE } = {}) {
  const q = query.trim().toLowerCase();
  return index.filter((doc) => doc.title.toLowerCase().includes(q)).slice(0, pageSize);
}
EOF
git add src/cart.js src/search.js
