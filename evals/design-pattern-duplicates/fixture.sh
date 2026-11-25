#!/usr/bin/env bash
set -euo pipefail
git init -q -b main
git config user.email eval@example.invalid
git config user.name eval
mkdir -p app

cat > app/base.css <<'CSS'
:root { --text: #18181b; --muted: #71717a; --line: #e4e4e7; }
body { margin: 0; color: var(--text); font: 14px/20px system-ui, sans-serif; }
.section { border-bottom: 1px solid var(--line); padding-bottom: 12px; margin-bottom: 16px; }
.section h2 { font: 500 13px/20px system-ui, sans-serif; color: var(--muted); margin: 0 0 4px; }
.avatar { width: 24px; height: 24px; border-radius: 50%; background: #d4d4d8; flex: none; }
CSS

cat > app/customers.html <<'HTML'
<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <title>Клиенты</title>
  <link rel="stylesheet" href="base.css">
  <style>
    .customer-row { display: flex; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--line); }
  </style>
</head>
<body>
  <main>
    <section class="section">
      <h2>Клиенты</h2>
      <div class="customer-row"><span class="avatar"></span><span>Покупатель 01</span></div>
      <div class="customer-row"><span class="avatar"></span><span>Покупатель 02</span></div>
      <div class="customer-row"><span class="avatar"></span><span>Покупатель 03</span></div>
    </section>
    <section class="section"><h2>Платежи</h2><p>Нет платежей за период.</p></section>
  </main>
</body>
</html>
HTML

cat > app/customer-panel.html <<'HTML'
<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <title>Клиент</title>
  <link rel="stylesheet" href="base.css">
  <style>
    .site-row { display: flex; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--line); }
  </style>
</head>
<body>
  <aside>
    <section class="section">
      <h2>Сайты</h2>
      <div class="site-row"><span class="avatar"></span><span>one.example</span></div>
      <div class="site-row"><span class="avatar"></span><span>two.example</span></div>
    </section>
    <section class="section"><h2>Письма</h2><p>Писем ещё не было.</p></section>
  </aside>
</body>
</html>
HTML

git add -A
git commit -q -m "Initial commit"
