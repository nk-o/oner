#!/usr/bin/env bash
set -euo pipefail
git init -q -b main
git config user.email eval@example.invalid
git config user.name eval
mkdir -p src

cat > package.json <<'EOF'
{ "name": "shop-checkout", "private": true, "type": "module" }
EOF
cat > src/price.js <<'EOF'
export function applyDiscount(cents, percent) {
  return Math.round(cents - (cents * percent) / 100);
}
EOF
cat > src/format.js <<'EOF'
export function formatPrice(cents) {
  if (cents === undefined) return '';
  return `$${(cents / 100).toFixed(2)}`;
}
EOF
cat > src/cart.js <<'EOF'
export function removeItem(cart, id) {
  const item = cart.items.find((i) => i.id === id);
  if (item) item.qty = 0;
}
EOF
cat > src/legacy-export.js <<'EOF'
export function exportCsv(rows) {
  return rows.map((r) => [r.id, r.name, r.total].join(',')).join('\n');
}
EOF
git add -A
git commit -qm "feat(shop): add prices, cart, and csv export"

git checkout -q -b feat/checkout-total
cat > src/checkout.js <<'EOF'
import { applyDiscount } from './price.js';
import { formatPrice } from './format.js';

export function checkoutTotal(items, { couponPercent = 0, salePercent = 0 } = {}) {
  let cents = 0;
  for (const item of items) {
    const line = applyDiscount(item.cents * (item.qty || 1), salePercent);
    cents += applyDiscount(line, salePercent);
  }
  return formatPrice(applyDiscount(cents, couponPercent));
}
EOF
cat > src/checkout-page.js <<'EOF'
import { checkoutTotal } from './checkout.js';

export function renderCheckout(cart, store) {
  const total = checkoutTotal(cart.items, { couponPercent: cart.couponPercent, salePercent: store.salePercent });
  return `<p class="total">Total: ${total}</p>`;
}
EOF
git add -A
git commit -qm "feat(checkout): show the order total with sale and coupon"
