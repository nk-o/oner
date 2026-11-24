#!/usr/bin/env bash
set -euo pipefail
git init -q -b main
git config user.email eval@example.invalid
git config user.name eval
mkdir -p src
cat > src/money.js <<'JS'
export function formatPrice(cents) {
  return (cents / 100).toFixed(2);
}
JS
cat > src/cart.js <<'JS'
import { formatPrice } from './money.js';

export function cartLine(item) {
  return `${item.title} x${item.qty}: ${formatPrice(item.price * item.qty)} RUB`;
}
JS
cat > src/export.js <<'JS'
import { formatPrice } from './money.js';

export function ordersCsv(orders) {
  const rows = orders.map((o) => [o.id, o.date, formatPrice(o.totalCents)].join(','));
  return ['id,date,total', ...rows].join('\n');
}
JS
cat > src/receipt.js <<'JS'
import { formatPrice } from './money.js';

export function receiptTotal(order) {
  return 'Итого: ' + formatPrice(order.totalCents) + ' RUB';
}
JS
cat > package.json <<'JSON'
{ "name": "shop", "private": true, "type": "module", "scripts": { "test": "node --test" } }
JSON
git add -A
git commit -qm "feat: price formatting"
git switch -q -c price-format
cat > src/money.js <<'JS'
const rub = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function formatPrice(cents) {
  return rub.format(cents / 100);
}
JS
git commit -qam "feat: format prices for the ru locale"
