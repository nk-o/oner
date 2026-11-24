#!/usr/bin/env bash
set -euo pipefail
git init -q -b main
git config user.email eval@example.invalid
git config user.name eval
mkdir -p src/sidebar
cat > index.html <<'HTML'
<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <title>Конструктор страниц</title>
  <link rel="stylesheet" href="src/sidebar/sidebar.css">
</head>
<body>
  <aside id="sidebar" class="sidebar"></aside>
  <main id="canvas"></main>
  <script type="module" src="src/sidebar/sidebar.js"></script>
</body>
</html>
HTML
cat > src/sidebar/sidebar.js <<'JS'
import { renderStylesPanel } from './StylesPanel.js';
import { renderBlocksPanel } from './BlocksPanel.js';

const root = document.getElementById('sidebar');
const tabs = { styles: renderStylesPanel, blocks: renderBlocksPanel };

function show(name) {
  root.replaceChildren(tabBar(name), tabs[name]());
}

function tabBar(active) {
  const bar = document.createElement('nav');
  bar.className = 'tabs';
  for (const [name, label] of [['blocks', 'Блоки'], ['styles', 'Стили']]) {
    const b = document.createElement('button');
    b.textContent = label;
    b.className = name === active ? 'tab is-active' : 'tab';
    b.onclick = () => show(name);
    bar.append(b);
  }
  return bar;
}

show('blocks');
JS
cat > src/sidebar/StylesPanel.js <<'JS'
const GROUPS = [
  { title: 'Типографика', fields: [['Шрифт', 'select'], ['Размер', 'number'], ['Межстрочный интервал', 'number']] },
  { title: 'Отступы', fields: [['Внутренние', 'number'], ['Внешние', 'number']] },
  { title: 'Рамка', fields: [['Толщина', 'number'], ['Скругление', 'number'], ['Цвет', 'color']] },
  { title: 'Заливка', fields: [['Цвет', 'color'], ['Прозрачность', 'number']] },
];

export function renderStylesPanel() {
  const panel = document.createElement('section');
  panel.className = 'panel styles-panel';
  for (const group of GROUPS) {
    const el = document.createElement('details');
    el.className = 'style-group';
    const summary = document.createElement('summary');
    summary.textContent = group.title;
    el.append(summary);
    for (const [label, type] of group.fields) {
      const row = document.createElement('label');
      row.className = 'field';
      row.textContent = label;
      const input = document.createElement(type === 'select' ? 'select' : 'input');
      if (type !== 'select') input.type = type;
      row.append(input);
      el.append(row);
    }
    panel.append(el);
  }
  return panel;
}
JS
cat > src/sidebar/BlocksPanel.js <<'JS'
const CATEGORIES = [
  { title: 'Основные', blocks: ['Заголовок', 'Текст', 'Кнопка', 'Изображение'] },
  { title: 'Разметка', blocks: ['Колонки', 'Сетка', 'Разделитель'] },
  { title: 'Медиа', blocks: ['Видео', 'Галерея', 'Карта'] },
];

export function renderBlocksPanel() {
  const panel = document.createElement('section');
  panel.className = 'panel blocks-panel';
  for (const category of CATEGORIES) {
    const group = document.createElement('details');
    group.className = 'block-category';
    group.open = true;
    const summary = document.createElement('summary');
    summary.textContent = category.title;
    group.append(summary);
    const grid = document.createElement('div');
    grid.className = 'block-grid';
    for (const name of category.blocks) {
      const tile = document.createElement('button');
      tile.className = 'block-tile';
      tile.textContent = name;
      tile.draggable = true;
      grid.append(tile);
    }
    group.append(grid);
    panel.append(group);
  }
  return panel;
}
JS
cat > src/sidebar/sidebar.css <<'CSS'
.sidebar { width: 280px; height: 100vh; overflow: hidden; border-right: 1px solid #ddd; font: 14px system-ui, sans-serif; }
.tabs { display: flex; border-bottom: 1px solid #ddd; }
.tab { flex: 1; padding: 10px; border: 0; }
.tab.is-active { font-weight: 600; }
.panel { padding: 8px 12px; }
.style-group summary, .block-category summary { padding: 8px 0; cursor: pointer; }
.field { display: flex; justify-content: space-between; padding: 4px 0; }
.block-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.block-tile { padding: 12px 6px; border: 1px solid #ddd; border-radius: 6px; }
CSS
git add -A
git commit -qm "feat: builder sidebar with blocks and styles panels"
