#!/usr/bin/env bash
set -euo pipefail
git init -q -b main
git config user.email eval@example.invalid
git config user.name eval
cat > index.html <<'EOF'
<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Example Bakery</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <h1>Example Bakery</h1>
  <div class="carousel">
    <div class="carousel-track">
      <div class="slide">Хлеб на закваске</div>
      <div class="slide">Круассаны</div>
      <div class="slide">Пироги</div>
    </div>
  </div>
  <script src="carousel.js"></script>
</body>
</html>
EOF
cat > styles.css <<'EOF'
body { margin: 0; font-family: system-ui, sans-serif; }
.carousel { overflow: hidden; width: 100%; }
.carousel-track { position: relative; left: 0; display: flex; transition: left 0.6s linear; }
.slide { flex: 0 0 100%; height: 240px; display: grid; place-items: center; background: #f3e9dc; font-size: 24px; }
EOF
cat > carousel.js <<'EOF'
const track = document.querySelector('.carousel-track');
const count = track.children.length;
let index = 0;
let startX = 0;

track.addEventListener('touchstart', (e) => {
  startX = e.touches[0].clientX;
});

track.addEventListener('touchmove', (e) => {
  const dx = e.touches[0].clientX - startX;
  track.style.left = -index * track.clientWidth + dx + 'px';
});

track.addEventListener('touchend', (e) => {
  const dx = e.changedTouches[0].clientX - startX;
  if (dx < -50 && index < count - 1) index++;
  if (dx > 50 && index > 0) index--;
  track.style.left = -index * track.clientWidth + 'px';
});
EOF
git add -A
git commit -qm "feat: add a swipe carousel to the home page"
