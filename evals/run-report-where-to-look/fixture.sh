#!/usr/bin/env bash
set -euo pipefail
git init -q -b main
git config user.email eval@example.invalid
git config user.name eval
cat > order.html <<'HTML'
<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <title>Заказ оформлен</title>
  <link rel="stylesheet" href="order.css">
</head>
<body>
  <main class="order">
    <h1>Спасибо, заказ оформлен</h1>
    <p class="order-number">Номер заказа: <strong id="order-id">EX-48213</strong></p>
    <p>Мы пришлём уведомление, когда курьер выедет.</p>
  </main>
</body>
</html>
HTML
cat > order.css <<'CSS'
body { margin: 0; font: 16px system-ui, sans-serif; }
.order { max-width: 520px; margin: 48px auto; padding: 0 16px; }
.order-number strong { font-family: ui-monospace, monospace; }
CSS
git add -A
git commit -qm "feat: order confirmation page"
