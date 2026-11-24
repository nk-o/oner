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
cat > src/orders.js <<'EOF'
export function loadOrders() {
  return [
    { id: 101, customer: 'Ann Lee', total: 42.5, placedAt: '2026-03-02T10:15:00Z' },
    { id: 102, customer: 'Bob Stone', total: 12, placedAt: '2026-03-04T08:00:00Z' },
  ];
}
EOF
cat > src/export.js <<'EOF'
const COLUMNS = ['id', 'customer', 'total'];

export function toCsv(orders) {
  const header = COLUMNS.join(',');
  const rows = orders.map((o) => COLUMNS.map((c) => o[c]).join(','));
  return [header, ...rows].join('\n');
}
EOF
cat > src/server.js <<'EOF'
import { createServer } from 'node:http';
import { loadOrders } from './orders.js';
import { toCsv } from './export.js';

export const server = createServer((req, res) => {
  if (req.url === '/orders.csv') {
    res.writeHead(200, { 'content-type': 'text/csv; charset=utf-8' });
    res.end(toCsv(loadOrders()));
    return;
  }
  res.writeHead(404);
  res.end();
});
EOF
cat > test/export.test.js <<'EOF'
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { toCsv } from '../src/export.js';

test('one row per order under a header', () => {
  assert.equal(toCsv([{ id: 1, customer: 'Ann Lee', total: 5 }]), 'id,customer,total\n1,Ann Lee,5');
});
EOF
git add -A
git commit -qm "feat: export orders as csv"
