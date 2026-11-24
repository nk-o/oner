#!/usr/bin/env bash
set -euo pipefail
git init -q -b main
git config user.email eval@example.invalid
git config user.name eval
mkdir -p src

cat > package.json <<'EOF'
{ "name": "orders-api", "private": true, "type": "module" }
EOF
cat > README.md <<'EOF'
# Orders API

Internal API behind the shop's order pages. Every signed-in shop owner uses it.

- `GET /orders?page=N` returns 20 orders per page. Pages start at 1, and `page` defaults to 1.
- `GET /orders/:id` returns one order, or 404 when the id is unknown.
EOF
cat > src/db.js <<'EOF'
const rows = Array.from({ length: 45 }, (_, i) => ({ id: `o${i + 1}`, total: (i + 1) * 100 }));

export async function listOrders() {
  return rows;
}

export async function findOrder(id) {
  return rows.find((r) => r.id === id) ?? null;
}
EOF
git add -A
git commit -qm "feat(db): add order storage"

git checkout -q -b feat/order-endpoints
mkdir -p src/handlers
cat > src/paginate.js <<'EOF'
export function pageSlice(items, page, size) {
  const start = page * size;
  return items.slice(start, start + size);
}
EOF
cat > src/util.js <<'EOF'
export function isMissing(value) {
  return value == null;
}
EOF
cat > src/handlers/order-list.js <<'EOF'
import { listOrders } from '../db.js';
import { pageSlice } from '../paginate.js';
import { isMissing } from '../util.js';

export async function orderList(query) {
  const page = isMissing(query.page) ? 1 : Number(query.page);
  const orders = await listOrders();
  return { status: 200, body: pageSlice(orders, page, 20) };
}
EOF
cat > src/handlers/order-detail.js <<'EOF'
import { findOrder } from '../db.js';
import { isMissing } from '../util.js';

export async function orderDetail(params) {
  const order = findOrder(params.id);
  if (isMissing(order)) return { status: 404, body: { error: 'not found' } };
  return { status: 200, body: { id: order.id, total: order.total } };
}
EOF
cat > src/routes.js <<'EOF'
import { orderList } from './handlers/order-list.js';
import { orderDetail } from './handlers/order-detail.js';

export const routes = [
  { method: 'GET', path: '/orders', handler: (req) => orderList(req.query) },
  { method: 'GET', path: '/orders/:id', handler: (req) => orderDetail(req.params) },
];
EOF
git add -A
git commit -qm "feat(orders): add list and detail endpoints"
