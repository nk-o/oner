#!/usr/bin/env bash
set -euo pipefail
git init -q -b main
git config user.email eval@example.invalid
git config user.name eval
mkdir -p src

cat > package.json <<'EOF'
{ "name": "pocket-notes", "private": true, "type": "module" }
EOF
cat > README.md <<'EOF'
# Pocket notes

A single-user notes app that runs in the browser. Notes live in localStorage. There is no server.
EOF
cat > src/notes.js <<'EOF'
const KEY = 'notes';

export function loadNotes(storage) {
  return JSON.parse(storage.getItem(KEY) ?? '[]');
}

export function saveNote(storage, note) {
  const notes = loadNotes(storage).filter((n) => n.id !== note.id);
  notes.push({ ...note, updatedAt: new Date().toISOString() });
  storage.setItem(KEY, JSON.stringify(notes));
}
EOF
cat > src/app.js <<'EOF'
import { loadNotes, saveNote } from './notes.js';

export function mount(root, storage = window.localStorage) {
  const render = () => {
    root.innerHTML = loadNotes(storage).map((n) => `<article><h2>${n.title}</h2><p>${n.body}</p></article>`).join('');
  };
  root.addEventListener('submit', (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    saveNote(storage, { id: crypto.randomUUID(), title: form.get('title'), body: form.get('body') });
    render();
  });
  render();
}
EOF
git add -A
git commit -qm "feat: add notes app"
