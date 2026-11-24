#!/usr/bin/env bash
set -euo pipefail
git init -q -b main
git config user.email eval@example.invalid
git config user.name eval
mkdir -p src

cat > src/cart.js <<'EOF'
export function calc(items) {
  return items.reduce((sum, item) => sum + item.price * item.qty, 0);
}

export function summary(items) {
  const total = calc(items);
  return `${items.length} items, ${total} total`;
}
EOF
git add -A
git commit -qm "feat(cart): add cart summary"

cat > README.md <<'EOF'
# Cart

Small cart helpers.
EOF
git add -A
git commit -qm "docs: add readme"

cat > src/cart.js <<'EOF'
export function itemsTotal(items) {
  return items.reduce((sum, item) => sum + item.price * item.qty, 0);
}

export function summary(items) {
  const total = itemsTotal(items);
  return `${items.length} items, ${total} total`;
}
EOF
git add src/cart.js
