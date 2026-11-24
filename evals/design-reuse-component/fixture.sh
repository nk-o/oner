#!/usr/bin/env bash
set -euo pipefail
git init -q -b main
git config user.email eval@example.invalid
git config user.name eval
mkdir -p components

cat > styles.css <<'EOF'
:root {
  --space-2: 8px;
  --space-3: 12px;
  --radius: 6px;
  --text: #1f2328;
  --muted: #59636e;
  --surface: #ffffff;
  --border: #d1d9e0;
}
body { font: 15px/1.5 system-ui, sans-serif; color: var(--text); margin: 0; }
main { max-width: 640px; margin: 0 auto; padding: 24px 16px; }
.field { display: grid; gap: var(--space-2); margin-bottom: 20px; }
.field-label { display: flex; align-items: center; gap: var(--space-2); font-weight: 600; }
.hint-button {
  width: 20px; height: 20px; border-radius: 50%; border: 1px solid var(--border);
  background: var(--surface); color: var(--muted); font-size: 12px; cursor: pointer;
}
.popover {
  position: absolute; max-width: 260px; padding: var(--space-2) var(--space-3);
  background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
  box-shadow: 0 4px 12px rgb(0 0 0 / 0.08); font-size: 13px; color: var(--text);
}
.popover[hidden] { display: none; }
EOF

cat > components/popover.js <<'EOF'
export function attachPopover(anchor, { text }) {
  const pop = document.createElement('div');
  pop.className = 'popover';
  pop.setAttribute('role', 'tooltip');
  pop.id = `${anchor.id}-popover`;
  pop.textContent = text;
  pop.hidden = true;
  document.body.append(pop);
  anchor.setAttribute('aria-describedby', pop.id);
  anchor.setAttribute('aria-expanded', 'false');

  const place = () => {
    const r = anchor.getBoundingClientRect();
    pop.style.top = `${r.bottom + window.scrollY + 6}px`;
    pop.style.left = `${r.left + window.scrollX}px`;
  };
  const show = () => { place(); pop.hidden = false; anchor.setAttribute('aria-expanded', 'true'); };
  const hide = () => { pop.hidden = true; anchor.setAttribute('aria-expanded', 'false'); };

  anchor.addEventListener('click', () => (pop.hidden ? show() : hide()));
  anchor.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); });
  document.addEventListener('click', (e) => {
    if (e.target !== anchor && !pop.contains(e.target)) hide();
  });
  return { show, hide };
}
EOF

cat > page-a.html <<'EOF'
<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <title>Хранение</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <main>
    <h1>Хранение</h1>
    <div class="field">
      <label class="field-label" for="retention">
        Срок хранения
        <button type="button" class="hint-button" id="retention-hint" aria-label="Что такое срок хранения">?</button>
      </label>
      <select id="retention">
        <option>30 дней</option>
        <option>90 дней</option>
        <option>1 год</option>
      </select>
    </div>
  </main>
  <script type="module">
    import { attachPopover } from './components/popover.js';
    attachPopover(document.getElementById('retention-hint'), {
      text: 'Старые записи удаляются автоматически после этого срока.',
    });
  </script>
</body>
</html>
EOF

cat > page-b.html <<'EOF'
<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <title>Уведомления</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <main>
    <h1>Уведомления</h1>
    <div class="field">
      <label class="field-label" for="channel">Канал</label>
      <select id="channel">
        <option>Почта</option>
        <option>Пуш</option>
      </select>
    </div>
    <div class="field">
      <label class="field-label" for="quiet-hours">Тихие часы</label>
      <input id="quiet-hours" type="text" value="22:00-08:00">
    </div>
  </main>
</body>
</html>
EOF

git add -A
git commit -qm "feat: add storage and notification settings pages"
