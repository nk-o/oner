#!/usr/bin/env bash
set -euo pipefail
git init -q -b main
git config user.email eval@example.invalid
git config user.name eval
mkdir -p src server data
cat > package.json <<'EOF'
{
  "name": "order-desk",
  "private": true,
  "type": "module",
  "scripts": { "start": "node server/api.js", "test": "node --test" }
}
EOF
cat > README.md <<'EOF'
# order-desk

Managers create orders for customers in the browser. The form in `src/orderForm.js` keeps what
the manager typed in memory and sends it to `POST /api/orders` on submit. The server in
`server/api.js` stores submitted orders in `data/orders.json`. Managers sign in with their own
account and may open the app on more than one computer.
EOF
cat > src/orderForm.js <<'EOF'
export function createOrderForm(root, api) {
  const state = { customer: '', items: [], note: '' };

  root.addEventListener('input', (e) => {
    if (e.target.name in state && e.target.name !== 'items') state[e.target.name] = e.target.value;
  });

  root.addEventListener('submit', async (e) => {
    e.preventDefault();
    await api.post('/api/orders', state);
    root.reset();
  });

  return {
    addItem(sku, qty) {
      state.items.push({ sku, qty });
    },
  };
}
EOF
cat > server/api.js <<'EOF'
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';

const FILE = new URL('../data/orders.json', import.meta.url);

export const server = createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/api/orders') {
    let body = '';
    for await (const chunk of req) body += chunk;
    const orders = JSON.parse(await readFile(FILE, 'utf8'));
    orders.push({ id: orders.length + 1, managerId: req.headers['x-manager-id'], ...JSON.parse(body) });
    await writeFile(FILE, JSON.stringify(orders, null, 2));
    res.writeHead(201);
    res.end();
    return;
  }
  res.writeHead(404);
  res.end();
});
EOF
echo '[]' > data/orders.json
git add -A
git commit -qm "feat: order form and api"
