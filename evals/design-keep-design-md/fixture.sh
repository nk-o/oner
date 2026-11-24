#!/usr/bin/env bash
set -euo pipefail
git init -q -b main
git config user.email eval@example.invalid
git config user.name eval

cat > DESIGN.md <<'EOF'
# Design

## Layout
- Page content sits centered in a card, max-width 720px.
- One column of content. Groups are separated by a heading and 24px of space.

## Tokens
- Colors, spacing, and radius come from the custom properties in `app.css`.
- Primary actions use `.button-primary`, one per page.
EOF

cat > app.css <<'EOF'
:root {
  --bg: #f5f6f8;
  --surface: #ffffff;
  --text: #1c1f24;
  --muted: #5d6470;
  --border: #dfe3e8;
  --accent: #2f6fde;
  --radius: 10px;
  --space: 8px;
}
body { margin: 0; background: var(--bg); color: var(--text); font: 15px/1.5 system-ui, sans-serif; }
.card {
  max-width: 720px; margin: 32px auto; padding: calc(var(--space) * 4);
  background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
}
.group { margin-top: calc(var(--space) * 3); }
.group h2 { font-size: 16px; margin: 0 0 var(--space); }
.row { display: flex; justify-content: space-between; align-items: center; padding: var(--space) 0; }
.hint { color: var(--muted); font-size: 13px; }
.button-primary {
  background: var(--accent); color: #fff; border: 0; border-radius: var(--radius);
  padding: var(--space) calc(var(--space) * 2); font: inherit; cursor: pointer;
}
EOF

cat > profile.html <<'EOF'
<!doctype html>
<html lang="ru">
<head><meta charset="utf-8"><title>Профиль</title><link rel="stylesheet" href="app.css"></head>
<body>
  <main class="card">
    <h1>Профиль</h1>
    <section class="group">
      <h2>Имя</h2>
      <div class="row"><label for="name">Отображаемое имя</label><input id="name" value="Тестовый пользователь"></div>
    </section>
    <button class="button-primary">Сохранить</button>
  </main>
</body>
</html>
EOF

cat > settings.html <<'EOF'
<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <title>Настройки</title>
  <link rel="stylesheet" href="app.css">
  <style>
    .settings-wide { padding: 16px; }
    .settings-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; }
    .settings-grid div { background: #fff; padding: 6px; font-size: 12px; }
  </style>
</head>
<body>
  <main class="settings-wide">
    <h1>Настройки</h1>
    <div class="settings-grid">
      <div><b>Язык</b><br><select><option>Русский</option><option>English</option></select></div>
      <div><b>Часовой пояс</b><br><select><option>UTC+3</option><option>UTC</option></select></div>
      <div><b>Формат даты</b><br><select><option>ДД.ММ.ГГГГ</option><option>ГГГГ-ММ-ДД</option></select></div>
      <div><b>Письма о входе</b><br><input type="checkbox" checked></div>
      <div><b>Еженедельная сводка</b><br><input type="checkbox"></div>
      <div><b>Звук</b><br><input type="checkbox" checked></div>
    </div>
    <button style="background:#2f6fde;color:#fff;border:0;padding:4px 8px">Сохранить</button>
    <button style="background:#2f6fde;color:#fff;border:0;padding:4px 8px">Применить</button>
  </main>
</body>
</html>
EOF

git add -A
git commit -qm "feat: add profile and settings pages"
