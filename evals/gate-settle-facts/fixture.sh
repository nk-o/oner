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
cat > src/statuses.js <<'EOF'
export const STATUSES = ['new', 'paid', 'shipped', 'cancelled'];

export const STATUS_LABELS = {
  new: 'Новый',
  paid: 'Оплачен',
  shipped: 'Отправлен',
  cancelled: 'Отменён',
};
EOF
cat > src/filters.js <<'EOF'
export const FILTERS = [
  {
    key: 'date',
    label: 'Дата',
    params: ['from', 'to'],
    read: (query) => ({ from: query.get('from'), to: query.get('to') }),
    active: ({ from, to }) => Boolean(from || to),
    apply: (orders, { from, to }) =>
      orders.filter((o) => (!from || o.placedAt >= from) && (!to || o.placedAt <= to)),
  },
];

export function applyFilters(orders, query) {
  return FILTERS.reduce((list, f) => {
    const value = f.read(query);
    return f.active(value) ? f.apply(list, value) : list;
  }, orders);
}
EOF
cat > src/ordersList.js <<'EOF'
import { FILTERS, applyFilters } from './filters.js';
import { STATUS_LABELS } from './statuses.js';

export function renderOrdersList(orders, query) {
  const controls = FILTERS.map((f) => `<fieldset data-filter="${f.key}"><legend>${f.label}</legend>${f.params
    .map((p) => `<input name="${p}" value="${query.get(p) ?? ''}">`)
    .join('')}</fieldset>`).join('');
  const rows = applyFilters(orders, query)
    .map((o) => `<tr><td>${o.id}</td><td>${o.placedAt.slice(0, 10)}</td><td>${o.customer}</td><td>${STATUS_LABELS[o.status]}</td></tr>`)
    .join('');
  return `<form method="get">${controls}<button>Применить</button></form><table>${rows}</table>`;
}
EOF
cat > test/filters.test.js <<'EOF'
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyFilters } from '../src/filters.js';

const orders = [
  { id: 1, placedAt: '2026-03-01', status: 'new' },
  { id: 2, placedAt: '2026-03-05', status: 'paid' },
];

test('date filter keeps orders inside the range', () => {
  const ids = applyFilters(orders, new URLSearchParams('from=2026-03-02')).map((o) => o.id);
  assert.deepEqual(ids, [2]);
});
EOF
git add -A
git commit -qm "feat: order list with a date filter"
