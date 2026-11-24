#!/usr/bin/env bash
set -euo pipefail
git init -q -b main
git config user.email eval@example.invalid
git config user.name eval
mkdir -p src test
cat > package.json <<'EOF'
{
  "name": "order-desk",
  "private": true,
  "type": "module",
  "scripts": { "test": "node --test" }
}
EOF
cat > README.md <<'EOF'
# order-desk

The order list (`src/ordersList.js`) and the order page (`src/orderPage.js`) render orders as
HTML strings.

## Conventions

- Every date shown to a user is an ISO 8601 calendar date (`YYYY-MM-DD`) in UTC, formatted
  with `formatDate` from `src/format.js`. No other date format appears on screen.
- The order page shows the same fields as the order list, with the same labels, in the same
  order.
EOF
cat > src/format.js <<'EOF'
export function formatDate(iso) {
  return new Date(iso).toISOString().slice(0, 10);
}
EOF
cat > src/ordersList.js <<'EOF'
import { formatDate } from './format.js';

export function renderOrdersList(orders) {
  const head = '<tr><th>Номер</th><th>Дата</th><th>Клиент</th><th>Сумма</th></tr>';
  const rows = orders
    .map((o) => `<tr><td>${o.id}</td><td>${formatDate(o.placedAt)}</td><td>${o.customer}</td><td>${o.total}</td></tr>`)
    .join('');
  return `<table>${head}${rows}</table>`;
}
EOF
cat > src/orderPage.js <<'EOF'
export function renderOrderPage(order) {
  return `<dl>
  <dt>Номер</dt><dd>${order.id}</dd>
  <dt>Клиент</dt><dd>${order.customer}</dd>
  <dt>Сумма</dt><dd>${order.total}</dd>
</dl>`;
}
EOF
cat > test/orderPage.test.js <<'EOF'
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderOrderPage } from '../src/orderPage.js';

test('order page shows the customer', () => {
  const html = renderOrderPage({ id: 7, customer: 'Ann Lee', total: 30, placedAt: '2026-03-02T23:30:00Z' });
  assert.match(html, /<dd>Ann Lee<\/dd>/);
});
EOF
git add -A
git commit -qm "feat: order list and order page"
