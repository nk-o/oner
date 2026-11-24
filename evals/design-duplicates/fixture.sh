#!/usr/bin/env bash
set -euo pipefail
git init -q -b main
git config user.email eval@example.invalid
git config user.name eval
mkdir -p site editor

cat > site/base.css <<'EOF'
:root { --text: #1f2328; --muted: #59636e; --accent: #0b63ce; --surface-alt: #f6f8fa; --border: #d0d7de; }
body { margin: 0; color: var(--text); font: 16px/1.6 Georgia, serif; }
.article { max-width: 680px; margin: 0 auto; padding: 32px 16px; }
.article h1 { font: 600 28px/1.25 system-ui, sans-serif; }
EOF

cat > site/article.html <<'EOF'
<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <title>Как вернуть удалённый проект</title>
  <link rel="stylesheet" href="base.css">
  <style>
    .callout { background: #f6f8fa; border-left: 1px solid #d0d7de; padding: 8px 12px; color: #57606a; }
  </style>
</head>
<body>
  <article class="article">
    <h1>Как вернуть удалённый проект</h1>
    <p>Удалённый проект лежит в корзине, пока его не удалят окончательно.</p>
    <div class="callout"><p>Проект из корзины удаляется навсегда через 30 дней.</p></div>
    <p>Откройте корзину, выберите проект и нажмите «Восстановить».</p>
  </article>
</body>
</html>
EOF

cat > editor/editor.css <<'EOF'
body { margin: 0; font: 14px/1.4 system-ui, sans-serif; }
.toolbar { display: flex; gap: 8px; padding: 8px 12px; border-bottom: 1px solid #d0d7de; }
.split { display: grid; grid-template-columns: 1fr 1fr; height: calc(100vh - 41px); }
.source { padding: 12px; font-family: ui-monospace, monospace; }
.preview { overflow: auto; border-left: 1px solid #d0d7de; }
EOF

cat > editor/preview.html <<'EOF'
<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <title>Редактор статьи</title>
  <link rel="stylesheet" href="editor.css">
  <link rel="stylesheet" href="../site/base.css">
  <style>
    .callout { background: #f6f8fa; border-left: 1px solid #d0d7de; padding: 8px 12px; color: #57606a; }
  </style>
</head>
<body>
  <div class="toolbar"><button>Сохранить черновик</button><button>Опубликовать</button></div>
  <div class="split">
    <textarea class="source">Удалённый проект лежит в корзине...</textarea>
    <div class="preview">
      <article class="article">
        <h1>Как вернуть удалённый проект</h1>
        <p>Удалённый проект лежит в корзине, пока его не удалят окончательно.</p>
        <div class="callout"><p>Проект из корзины удаляется навсегда через 30 дней.</p></div>
        <p>Откройте корзину, выберите проект и нажмите «Восстановить».</p>
      </article>
    </div>
  </div>
</body>
</html>
EOF

git add -A
git commit -qm "feat: add help article page and editor preview"
