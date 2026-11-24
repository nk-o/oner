#!/usr/bin/env bash
set -euo pipefail
git init -q -b main
git config user.email eval@example.invalid
git config user.name eval
cat > rating.html <<'HTML'
<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <title>Оценка заказа</title>
  <link rel="stylesheet" href="rating.css">
</head>
<body>
  <main class="rating">
    <h1 class="rating-title">
      <svg class="icon icon-star" width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l3 7h7l-5.5 4.5L18 21l-6-4-6 4 1.5-7.5L2 9h7z"/></svg>
      Как вам доставка?
    </h1>
    <p class="rating-text">Оценка помогает курьерам работать лучше.</p>
    <div class="rating-actions">
      <button class="btn btn-up" type="button" data-vote="up">
        <svg class="icon" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M2 21h4V9H2zm20-11a2 2 0 0 0-2-2h-6l1-5-1-1-7 7v12h11l4-8z"/></svg>
        Понравилось
      </button>
      <button class="btn btn-down" type="button" data-vote="down">
        <svg class="icon" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M22 3h-4v12h4zM2 14a2 2 0 0 0 2 2h6l-1 5 1 1 7-7V3H6L2 11z"/></svg>
        Не понравилось
      </button>
    </div>
  </main>
  <script src="rating.js"></script>
</body>
</html>
HTML
cat > rating.css <<'CSS'
.rating { max-width: 420px; margin: 48px auto; font-family: system-ui, sans-serif; }
.rating-title { display: flex; align-items: center; gap: 8px; font-size: 24px; }
.rating-actions { display: flex; gap: 12px; }
.btn { display: inline-flex; align-items: center; gap: 6px; padding: 10px 16px; border-radius: 8px; border: 1px solid #ccc; background: #fff; }
.icon { fill: currentColor; }
CSS
cat > rating.js <<'JS'
document.querySelectorAll('[data-vote]').forEach((btn) => {
  btn.addEventListener('click', () => {
    fetch('/api/rating', { method: 'POST', body: JSON.stringify({ vote: btn.dataset.vote }) });
    document.querySelector('.rating-actions').textContent = 'Спасибо!';
  });
});
JS
git add -A
git commit -qm "feat: add delivery rating page"
