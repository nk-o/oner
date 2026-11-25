// Evaluate this file's trimmed text as one expression in the page, e.g. page.evaluate(source).
// Set globalThis.geometryRoot to a selector first to scope it. Returns an array of findings.
(() => {
  const root = document.querySelector(globalThis.geometryRoot || 'body') || document.body;
  const PER_CHECK = 25;
  const findings = [];
  const counts = {};
  const add = (check, el, detail) => {
    counts[check] = (counts[check] || 0) + 1;
    if (counts[check] <= PER_CHECK) findings.push({ check, at: path(el), detail });
  };
  const round = (n) => Math.round(n * 10) / 10;
  const px = (value) => Number.parseFloat(value) || 0;

  function path(el) {
    const parts = [];
    for (let node = el; node && node.nodeType === 1 && parts.length < 4; node = node.parentElement) {
      let part = node.tagName.toLowerCase();
      if (node.id) {
        parts.unshift(`${part}#${node.id}`);
        break;
      }
      const cls = [...node.classList].slice(0, 2).join('.');
      if (cls) part += `.${cls}`;
      const parent = node.parentElement;
      if (parent) {
        const same = [...parent.children].filter((c) => c.tagName === node.tagName);
        if (same.length > 1) part += `:nth-of-type(${same.indexOf(node) + 1})`;
      }
      parts.unshift(part);
    }
    const text = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30);
    return text ? `${parts.join(' > ')} "${text}"` : parts.join(' > ');
  }

  function visible(el) {
    const style = getComputedStyle(el);
    if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function alpha(color) {
    if (!color || color === 'transparent') return 0;
    const m = color.match(/rgba?\(([^)]+)\)/);
    if (!m) return 1;
    const parts = m[1].split(/[\s,/]+/).filter(Boolean);
    return parts.length > 3 ? Number.parseFloat(parts[3]) : 1;
  }

  function ownBackground(el) {
    const style = getComputedStyle(el);
    if (alpha(style.backgroundColor) === 0) return false;
    for (let p = el.parentElement; p; p = p.parentElement) {
      const bg = getComputedStyle(p).backgroundColor;
      if (alpha(bg) > 0) return bg !== style.backgroundColor;
    }
    return true;
  }

  function borders(el) {
    const s = getComputedStyle(el);
    const side = (name) => px(s[`border${name}Width`]) > 0 && s[`border${name}Style`] !== 'none' && alpha(s[`border${name}Color`]) > 0;
    return { top: side('Top'), right: side('Right'), bottom: side('Bottom'), left: side('Left') };
  }

  function surface(el) {
    const b = borders(el);
    const sides = [b.top, b.right, b.bottom, b.left].filter(Boolean).length;
    return ownBackground(el) || sides >= 3 || getComputedStyle(el).boxShadow !== 'none';
  }

  function textRectsIn(el) {
    const out = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.textContent.trim() || !node.parentElement || !visible(node.parentElement)) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const r of range.getClientRects()) if (r.width > 0 && r.height > 0) out.push(r);
    }
    return out;
  }

  const REPLACED = 'img, svg, video, canvas, input, select, textarea, button, [role="img"]';
  const elements = [root, ...root.querySelectorAll('*')].filter(visible);

  const visuals = elements.filter((el) => {
    if (el.parentElement && el.parentElement.closest('svg')) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 12 || r.width > 64 || r.height < 12 || r.height > 64) return false;
    if (el.matches('img, svg, picture, canvas, [role="img"]')) return true;
    const square = Math.abs(r.width - r.height) <= 4;
    const painted = ownBackground(el) || getComputedStyle(el).backgroundImage !== 'none' || el.querySelector('img, svg');
    return square && painted && !(el.textContent || '').trim();
  });

  function contentRectsIn(el) {
    const rects = textRectsIn(el);
    for (const child of el.querySelectorAll(REPLACED)) if (visible(child)) rects.push(child.getBoundingClientRect());
    for (const v of visuals) if (el !== v && el.contains(v)) rects.push(v.getBoundingClientRect());
    return rects;
  }

  function checkLeadingVisuals() {
    for (const v of visuals) {
      if (visuals.some((o) => o !== v && o.contains(v))) continue;
      const r = v.getBoundingClientRect();
      let row = null;
      for (let node = v.parentElement, i = 0; node && i < 4 && !row; i++, node = node.parentElement) {
        const d = getComputedStyle(node).display;
        if (d.includes('flex') || d.includes('grid') || node.tagName === 'TR' || node.tagName === 'LI') row = node;
      }
      if (!row) continue;
      let cell = v;
      while (cell.parentElement !== row) cell = cell.parentElement;
      let group = textRectsIn(cell).length ? cell : cell.nextElementSibling;
      while (group && !textRectsIn(group).length) group = group.nextElementSibling;
      if (!group) continue;
      const rowBox = row.getBoundingClientRect();
      const beside = textRectsIn(group)
        .filter((t) => t.left >= r.right - 2)
        .sort((a, b) => a.top - b.top);
      if (beside.length < 2) continue;
      const first = beside[0];
      const block = Math.max(...beside.map((t) => t.bottom)) - first.top;
      if (first.top < rowBox.top - 1 || block <= first.height * 1.5 || block <= r.height + 4) continue;
      const offset = r.top + r.height / 2 - (first.top + first.height / 2);
      if (Math.abs(offset) > 2) add('leading-visual-off-first-line', v, `center is ${round(offset)}px from the first text line's center`);
    }
  }

  function checkPadding() {
    for (const el of elements) {
      if (!surface(el)) continue;
      const box = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      if (box.height > 160 || px(s.paddingTop) + px(s.paddingBottom) === 0) continue;
      const inside = contentRectsIn(el).filter(
        (r) => r.top >= box.top - 0.5 && r.bottom <= box.bottom + 0.5 && r.right > box.left && r.left < box.right,
      );
      if (!inside.length) continue;
      const top = Math.min(...inside.map((r) => r.top)) - box.top - px(s.borderTopWidth);
      const bottom = box.bottom - Math.max(...inside.map((r) => r.bottom)) - px(s.borderBottomWidth);
      if (top >= 0 && bottom >= 0 && Math.abs(top - bottom) > 4) {
        add('padding-uneven', el, `content sits ${round(top)}px from the top and ${round(bottom)}px from the bottom`);
      }
    }
  }

  function checkDoubleDividers() {
    const lines = [];
    for (const el of elements) {
      const r = el.getBoundingClientRect();
      const b = borders(el);
      const kind = !b.left && !b.right && b.top !== b.bottom ? 'divider' : 'edge';
      if (b.top) lines.push({ el, kind, y: r.top, x1: r.left, x2: r.right });
      if (b.bottom) lines.push({ el, kind, y: r.bottom, x1: r.left, x2: r.right });
      if (el.tagName === 'HR' || (r.height <= 2 && r.width > 40 && ownBackground(el))) lines.push({ el, kind: 'divider', y: r.top, x1: r.left, x2: r.right });
    }
    lines.sort((a, b) => a.y - b.y);
    const content = contentRectsIn(root);
    for (let i = 0; i < lines.length; i++) {
      for (let j = i + 1; j < lines.length && lines[j].y - lines[i].y <= 32; j++) {
        const a = lines[i];
        const b = lines[j];
        if (a.el === b.el || b.y - a.y < 1) continue;
        const edge = a.kind === 'edge' ? a : b.kind === 'edge' ? b : null;
        const other = edge === a ? b : a;
        if (edge && (other.kind === 'edge' || !edge.el.contains(other.el))) continue;
        const x1 = Math.max(a.x1, b.x1);
        const x2 = Math.min(a.x2, b.x2);
        if (x2 - x1 < 0.5 * Math.min(a.x2 - a.x1, b.x2 - b.x1)) continue;
        const between = content.some((r) => r.bottom > a.y + 1 && r.top < b.y - 1 && r.right > x1 && r.left < x2);
        if (!between) add('double-divider', b.el, `a line ${round(b.y - a.y)}px below another line with nothing between them (${path(a.el)})`);
      }
    }
  }

  function checkListEdges() {
    const HEADING = 'h1, h2, h3, h4, h5, h6, [role="heading"], legend, caption';
    for (const el of elements) {
      const kids = [...el.children].filter(visible);
      if (kids.length < 3) continue;
      const sig = (k) => `${k.tagName}.${k.classList[0] || ''}`;
      const tally = {};
      for (const k of kids) tally[sig(k)] = (tally[sig(k)] || 0) + 1;
      const [best, n] = Object.entries(tally).sort((a, b) => b[1] - a[1])[0];
      const rows = kids.filter((k) => sig(k) === best);
      const boxes = rows.map((row) => row.getBoundingClientRect());
      const stacked = boxes.every((box, i) => i === 0 || box.top >= boxes[i - 1].bottom - 1);
      if (n < 3 || n < kids.length * 0.6 || !stacked) continue;

      const lefts = rows.map((row) => {
        const rs = textRectsIn(row);
        return rs.length ? rs[0].left : null;
      });
      const known = lefts.filter((x) => x !== null).map(round);
      if (known.length >= 3) {
        const freq = {};
        for (const x of known) freq[x] = (freq[x] || 0) + 1;
        const [modeKey, modeCount] = Object.entries(freq).sort((a, b) => b[1] - a[1])[0];
        const mode = Number(modeKey);
        if (modeCount >= known.length * 0.6) {
          rows.forEach((row, i) => {
            if (lefts[i] !== null && Math.abs(lefts[i] - mode) > 1 && Math.abs(lefts[i] - mode) < 48) {
              add('row-text-off-edge', row, `text starts ${round(lefts[i] - mode)}px from the other rows' text edge`);
            }
          });
        }
      }

      const inside = kids.slice(0, kids.indexOf(rows[0])).reverse().find((k) => k.matches(HEADING));
      const prev = el !== root && root.contains(el.previousElementSibling) ? el.previousElementSibling : null;
      const wrapper = prev && !prev.matches(HEADING) && textRectsIn(prev).length <= 3 ? prev.querySelector(HEADING) : null;
      const heading = inside || (prev && prev.matches(HEADING) ? prev : wrapper);
      const marker = getComputedStyle(rows[0]);
      const bulleted = marker.display === 'list-item' && marker.listStyleType !== 'none';
      if (!heading || bulleted) continue;
      const headText = textRectsIn(heading)[0];
      const leads = rows
        .map((row, i) => {
          if (surface(row)) return boxes[i].left;
          const rs = contentRectsIn(row).filter((r) => r.left >= boxes[i].left - 0.5 && r.right <= boxes[i].right + 0.5);
          return rs.length ? Math.min(...rs.map((r) => r.left)) : null;
        })
        .filter((x) => x !== null);
      if (!headText || !leads.length) continue;
      const off = headText.left - Math.min(...leads);
      if (Math.abs(off) > 1 && Math.abs(off) <= 48) add('heading-off-row-edge', heading, `heading text starts ${round(off)}px from its rows' content edge`);
    }
  }

  function checkConcentricRadii() {
    const CORNERS = [
      ['TopLeft', (o, r) => [r.left - o.left, r.top - o.top]],
      ['TopRight', (o, r) => [o.right - r.right, r.top - o.top]],
      ['BottomRight', (o, r) => [o.right - r.right, o.bottom - r.bottom]],
      ['BottomLeft', (o, r) => [r.left - o.left, o.bottom - r.bottom]],
    ];
    const clips = (el) => ['overflow', 'overflowX', 'overflowY'].some((k) => getComputedStyle(el)[k] !== 'visible');
    const rounded = (el) => (surface(el) || clips(el)) && CORNERS.some(([c]) => px(getComputedStyle(el)[`border${c}Radius`]) > 0);
    const painted = (el) => ownBackground(el) || /inset/.test(getComputedStyle(el).boxShadow);
    for (const el of elements) {
      if (el === root || !painted(el)) continue;
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      if (px(s.borderTopLeftRadius) >= Math.min(r.width, r.height) / 2 - 1) continue;
      let outer = el.parentElement;
      while (outer && !rounded(outer)) outer = outer === root ? null : outer.parentElement;
      if (!outer) continue;
      const o = outer.getBoundingClientRect();
      if (r.width < o.width * 0.5) continue;
      const os = getComputedStyle(outer);
      const clipped = clips(outer);
      for (const [corner, gaps] of CORNERS) {
        const outerRadius = px(os[`border${corner}Radius`]);
        const [dx, dy] = gaps(o, r);
        if (outerRadius <= 0 || dx < 0 || dy < 0) continue;
        const inset = Math.max(dx, dy);
        if (inset > outerRadius / 2) continue;
        const expected = Math.max(outerRadius - inset, 0);
        const inner = px(s[`border${corner}Radius`]);
        if (clipped && inset <= 1 && inner < expected) continue;
        if (Math.abs(inner - expected) > 2) {
          add('radius-not-concentric', el, `${corner} radius ${round(inner)}px at ${round(inset)}px inside a ${round(outerRadius)}px corner, expected about ${round(expected)}px`);
        }
      }
    }
  }

  checkLeadingVisuals();
  checkPadding();
  checkDoubleDividers();
  checkListEdges();
  checkConcentricRadii();
  for (const [check, n] of Object.entries(counts)) {
    if (n > PER_CHECK) findings.push({ check, at: '', detail: `${n - PER_CHECK} more not listed` });
  }
  return findings;
})()
