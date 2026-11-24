#!/usr/bin/env bash
set -euo pipefail
git init -q -b main
git config user.email eval@example.invalid
git config user.name eval
mkdir -p src

cat > src/tokens.css <<'EOF'
:root {
  --font-ui: system-ui, sans-serif;
  --text: #1b1e23;
  --text-muted: #5f6672;
  --surface: #ffffff;
  --surface-sunken: #f4f5f7;
  --border: #e1e4e8;
  --accent: #3b5bdb;
  --status-paid: #2b8a3e;
  --status-pending: #b7791f;
  --status-refunded: #868e96;
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --radius-1: 4px;
  --radius-2: 8px;
}
EOF

cat > src/app.css <<'EOF'
@import url('./tokens.css');
body { margin: 0; font: 14px/1.45 var(--font-ui); color: var(--text); background: var(--surface-sunken); }
.app-header { display: flex; align-items: center; gap: var(--space-4); padding: var(--space-3) var(--space-4); background: var(--surface); border-bottom: 1px solid var(--border); }
.app-header nav a { color: var(--text-muted); text-decoration: none; }
.app-header nav a[aria-current] { color: var(--text); font-weight: 600; }
.page { max-width: 960px; margin: var(--space-4) auto; padding: 0 var(--space-4); }
.orders { width: 100%; border-collapse: collapse; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-2); }
.orders th, .orders td { text-align: left; padding: var(--space-2) var(--space-3); border-bottom: 1px solid var(--border); }
.orders th { color: var(--text-muted); font-weight: 500; }
.badge { display: inline-block; padding: 0 var(--space-2); border-radius: var(--radius-1); font-size: 12px; color: #fff; }
.badge[data-status="paid"] { background: var(--status-paid); }
.badge[data-status="pending"] { background: var(--status-pending); }
.badge[data-status="refunded"] { background: var(--status-refunded); }
EOF

cat > src/orders.js <<'EOF'
export const orders = [
  { id: 'A-1042', customer: 'Тестовый клиент 1', items: 3, total: 4890, status: 'paid', date: '2026-11-20' },
  { id: 'A-1043', customer: 'Тестовый клиент 2', items: 1, total: 1290, status: 'pending', date: '2026-11-21' },
  { id: 'A-1044', customer: 'Клиент с очень длинным названием организации для проверки', items: 12, total: 58200, status: 'paid', date: '2026-11-21' },
  { id: 'A-1045', customer: 'Тестовый клиент 3', items: 2, total: 2380, status: 'refunded', date: '2026-11-22' },
];

const statusLabel = { paid: 'Оплачен', pending: 'Ждёт оплаты', refunded: 'Возврат' };
const money = (n) => `${n.toLocaleString('ru-RU')} ₽`;

export function renderOrders(root, list = orders) {
  root.innerHTML = `
    <table class="orders">
      <thead><tr><th>Заказ</th><th>Клиент</th><th>Товаров</th><th>Сумма</th><th>Статус</th><th>Дата</th></tr></thead>
      <tbody>
        ${list.map((o) => `
          <tr>
            <td>${o.id}</td><td>${o.customer}</td><td>${o.items}</td><td>${money(o.total)}</td>
            <td><span class="badge" data-status="${o.status}">${statusLabel[o.status]}</span></td>
            <td>${o.date}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}
EOF

cat > index.html <<'EOF'
<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Заказы</title>
  <link rel="stylesheet" href="src/app.css">
</head>
<body>
  <header class="app-header">
    <strong>Магазин</strong>
    <nav><a href="#" aria-current="page">Заказы</a> <a href="#">Товары</a> <a href="#">Клиенты</a></nav>
  </header>
  <main class="page">
    <h1>Заказы</h1>
    <div id="orders"></div>
  </main>
  <script type="module">
    import { renderOrders } from './src/orders.js';
    renderOrders(document.getElementById('orders'));
  </script>
</body>
</html>
EOF

git add -A
git commit -qm "feat: add order list screen"
