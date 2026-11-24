#!/usr/bin/env bash
set -euo pipefail
git init -q -b main
git config user.email eval@example.invalid
git config user.name eval
cat > index.html <<'HTML'
<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <title>Список дел</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <main class="list">
    <h1>Список дел</h1>
    <ul id="items"><li>Купить хлеб</li><li>Позвонить в сервис</li></ul>
  </main>
  <button class="fab" type="button" aria-label="Добавить дело">+</button>
</body>
</html>
HTML
cat > styles.css <<'CSS'
body { margin: 0; font: 16px system-ui, sans-serif; }
.list { max-width: 480px; margin: 32px auto; padding: 0 16px; }
.fab {
  position: fixed;
  right: 24px;
  bottom: 24px;
  width: 56px;
  height: 56px;
  border: 0;
  border-radius: 8px;
  background: #2f6fde;
  color: #fff;
  font-size: 28px;
}
CSS
cat > test.mjs <<'JS'
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const html = readFileSync('index.html', 'utf8');
const css = readFileSync('styles.css', 'utf8');
assert.match(html, /<link rel="stylesheet" href="styles\.css">/);
assert.match(html, /class="fab"[^>]*aria-label="[^"]+"/);
assert.match(css, /\.fab\s*\{/);
console.log('ok 3 checks');
JS
cat > package.json <<'JSON'
{ "name": "todo-page", "private": true, "type": "module", "scripts": { "test": "node test.mjs" } }
JSON
git add -A
git commit -qm "feat: todo page with add button"
