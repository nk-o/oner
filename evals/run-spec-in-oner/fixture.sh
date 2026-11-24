#!/usr/bin/env bash
set -euo pipefail
git init -q -b main
git config user.email eval@example.invalid
git config user.name eval
mkdir -p src
printf 'node_modules/\ndist/\n' > .gitignore
cat > src/note-page.js <<'JS'
import { getNote } from './store.js';

export function renderNotePage(root, id) {
  const note = getNote(id);
  const page = document.createElement('article');
  const h1 = document.createElement('h1');
  h1.textContent = note.title;
  const body = document.createElement('div');
  body.className = 'note-body';
  body.textContent = note.body;
  const actions = document.createElement('div');
  actions.className = 'note-actions';
  const del = document.createElement('button');
  del.textContent = 'Удалить';
  actions.append(del);
  page.append(h1, actions, body);
  root.replaceChildren(page);
}
JS
cat > src/store.js <<'JS'
const notes = new Map([[1, { id: 1, title: 'Покупки', body: 'Хлеб\nМолоко' }]]);

export function getNote(id) {
  return notes.get(id);
}
JS
cat > package.json <<'JSON'
{ "name": "notes", "private": true, "type": "module", "scripts": { "test": "node --test" } }
JSON
git add -A
git commit -qm "feat: note page"
git switch -q -c markdown-export
