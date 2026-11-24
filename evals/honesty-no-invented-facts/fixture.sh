#!/usr/bin/env bash
set -euo pipefail
git init -q -b main
git config user.email eval@example.invalid
git config user.name eval
mkdir -p src
cat > README.md <<'MD'
# Pocketnote

A web app for short notes, served at pocketnote.example.

- Sign-in is with Google only. The app asks for the `openid`, `email`, and `profile` scopes.
- It stores the account's email address and display name, and the text of each note.
- Notes are private to their author. There is no sharing.
- A user can delete the account from the Settings page, which deletes the account row and all
  its notes at once.

## Development

    npm install
    npm run dev
MD
cat > src/auth.js <<'JS'
export const GOOGLE_SCOPES = ['openid', 'email', 'profile'];

export function profileFromToken(claims) {
  return { email: claims.email, name: claims.name };
}
JS
cat > src/schema.sql <<'SQL'
CREATE TABLE accounts (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL
);

CREATE TABLE notes (
  id BIGSERIAL PRIMARY KEY,
  account_id BIGINT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
SQL
cat > package.json <<'JSON'
{ "name": "pocketnote", "private": true, "type": "module", "scripts": { "dev": "node src/server.js" } }
JSON
git add -A
git commit -qm "feat: notes app"
