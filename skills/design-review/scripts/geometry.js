// Evaluate this file as one expression in the page, e.g. page.evaluate(source). Set
// globalThis.geometryRoot to a selector first to scope it. Returns an array of findings.
(() => {
  const root = document.querySelector(globalThis.geometryRoot || 'body') || document.body;
  const findings = [];
  const add = (check, el, detail) => {
    if (findings.length < 200) findings.push({ check, at: path(el), detail });
  };
  const round = (n) => Math.round(n * 10) / 10;

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
    const side = (name) =>
      Number.parseFloat(s[`border${name}Width`]) > 0 && s[`border${name}Style`] !== 'none' && alpha(s[`border${name}Color`]) > 0;
    return { top: side('Top'), right: side('Right'), bottom: side('Bottom'), left: side('Left') };
  }

  function surface(el) {
    const b = borders(el);
    const sides = [b.top, b.right, b.bottom, b.left].filter(Boolean).length;
    return ownBackground(el) || sides >= 3 || getComputedStyle(el).boxShadow !== 'none';
  }

  const elements = [...root.querySelectorAll('*')].filter(visible);

  const textRects = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.textContent.trim() || !node.parentElement || !visible(node.parentElement)) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    for (const r of range.getClientRects()) if (r.width > 0 && r.height > 0) textRects.push({ node, r });
  }
  const contentRects = textRects.map((t) => t.r);
  for (const el of elements) {
    if (el.matches('img, svg, video, canvas, input, select, textarea, button, [role="img"]')) {
      contentRects.push(el.getBoundingClientRect());
    }
  }

  const visuals = elements.filter((el) => {
    if (el.parentElement && el.parentElement.closest('svg')) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 12 || r.width > 64 || r.height < 12 || r.height > 64) return false;
    if (el.matches('img, svg, picture, canvas, [role="img"]')) return true;
    const square = Math.abs(r.width - r.height) <= 4;
    const painted = ownBackground(el) || getComputedStyle(el).backgroundImage !== 'none' || el.querySelector('img, svg');
    return square && painted && !(el.textContent || '').trim();
  });
  for (const v of visuals) contentRects.push(v.getBoundingClientRect());
  for (const v of visuals) {
    const r = v.getBoundingClientRect();
    if (visuals.some((o) => o !== v && o.contains(v))) continue;
    let row = v.parentElement;
    for (let i = 0; row && i < 4; i++, row = row.parentElement) {
      const d = getComputedStyle(row).display;
      if (d.includes('flex') || d.includes('grid') || row.tagName === 'TR' || row.tagName === 'LI') break;
    }
    if (!row) continue;
    const line = textRects.find(
      (t) => row.contains(t.node) && !v.contains(t.node) && t.r.left >= r.right - 2 && t.r.bottom > r.top - 8 && t.r.top < r.bottom + 8,
    );
    if (!line) continue;
    const lines = textRects.filter((t) => t.node.parentElement && t.r.left >= r.right - 2 && row.contains(t.node) && !v.contains(t.node));
    if (lines.length < 2) continue;
    const offset = r.top + r.height / 2 - (line.r.top + line.r.height / 2);
    const block = Math.max(...lines.map((t) => t.r.bottom)) - line.r.top;
    if (Math.abs(offset) > 2 && block > line.r.height * 1.5 && block > r.height + 4) {
      add('leading-visual-off-first-line', v, `center is ${round(offset)}px from the first text line's center`);
    }
  }

  for (const el of elements) {
    if (!surface(el)) continue;
    const box = el.getBoundingClientRect();
    if (box.height > 160) continue;
    const s = getComputedStyle(el);
    if (Number.parseFloat(s.paddingTop) + Number.parseFloat(s.paddingBottom) === 0) continue;
    const inside = contentRects.filter(
      (r) => r.top >= box.top - 0.5 && r.bottom <= box.bottom + 0.5 && r.left >= box.left - 0.5 && r.right <= box.right + 0.5,
    );
    if (!inside.length) continue;
    const top = Math.min(...inside.map((r) => r.top)) - box.top - Number.parseFloat(s.borderTopWidth);
    const bottom = box.bottom - Math.max(...inside.map((r) => r.bottom)) - Number.parseFloat(s.borderBottomWidth);
    if (top >= 0 && bottom >= 0 && Math.abs(top - bottom) > 4) {
      add('padding-uneven', el, `content sits ${round(top)}px from the top and ${round(bottom)}px from the bottom`);
    }
  }

  const lines = [];
  for (const el of elements) {
    const r = el.getBoundingClientRect();
    const b = borders(el);
    const divider = !b.left && !b.right && b.top !== b.bottom;
    if (divider && b.top) lines.push({ el, y: r.top, x1: r.left, x2: r.right });
    if (divider && b.bottom) lines.push({ el, y: r.bottom, x1: r.left, x2: r.right });
    if (el.tagName === 'HR' || (r.height <= 2 && r.width > 40 && ownBackground(el))) lines.push({ el, y: r.top, x1: r.left, x2: r.right });
  }
  lines.sort((a, b) => a.y - b.y);
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length && lines[j].y - lines[i].y <= 32; j++) {
      const a = lines[i];
      const b = lines[j];
      const dy = b.y - a.y;
      if (dy < 1.5) continue;
      const x1 = Math.max(a.x1, b.x1);
      const x2 = Math.min(a.x2, b.x2);
      if (x2 - x1 < 0.5 * Math.min(a.x2 - a.x1, b.x2 - b.x1)) continue;
      const between = contentRects.some((r) => r.bottom > a.y + 1 && r.top < b.y - 1 && r.right > x1 && r.left < x2);
      if (!between) add('double-divider', b.el, `a line ${round(dy)}px below another line with nothing between them (${path(a.el)})`);
    }
  }

  const lists = new Set();
  for (const el of elements) {
    const kids = [...el.children].filter(visible);
    if (kids.length < 3) continue;
    const sig = (k) => `${k.tagName}.${k.classList[0] || ''}`;
    const counts = {};
    for (const k of kids) counts[sig(k)] = (counts[sig(k)] || 0) + 1;
    const [best, n] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    const rows = kids.filter((k) => sig(k) === best);
    const stacked = rows.every((row, i) => i === 0 || row.getBoundingClientRect().top >= rows[i - 1].getBoundingClientRect().bottom - 1);
    if (n >= 3 && n >= kids.length * 0.6 && stacked) lists.add({ el, rows });
  }
  for (const { el, rows } of lists) {
    const lefts = rows.map((row) => {
      const first = textRects.find((t) => row.contains(t.node));
      return first ? first.r.left : null;
    });
    const known = lefts.filter((x) => x !== null).map(round);
    if (known.length < 3) continue;
    const freq = {};
    for (const x of known) freq[x] = (freq[x] || 0) + 1;
    const [modeKey, modeCount] = Object.entries(freq).sort((a, b) => b[1] - a[1])[0];
    if (modeCount < known.length * 0.6) continue;
    const mode = Number(modeKey);
    rows.forEach((row, i) => {
      if (lefts[i] !== null && Math.abs(lefts[i] - mode) > 1 && Math.abs(lefts[i] - mode) < 48) {
        add('row-text-off-edge', row, `text starts ${round(lefts[i] - mode)}px from the other rows' text edge`);
      }
    });
    let heading = el.previousElementSibling;
    if (heading && !heading.matches('h1, h2, h3, h4, h5, h6, [role="heading"], legend, caption')) {
      heading = heading.querySelector('h1, h2, h3, h4, h5, h6, [role="heading"]');
    }
    const headText = heading && textRects.find((t) => heading.contains(t.node));
    const leads = rows
      .map((row) => contentRects.filter((r) => { const b = row.getBoundingClientRect(); return r.left >= b.left - 0.5 && r.right <= b.right + 0.5 && r.top >= b.top - 0.5 && r.bottom <= b.bottom + 0.5; }))
      .filter((rs) => rs.length)
      .map((rs) => round(Math.min(...rs.map((r) => r.left))));
    const lead = leads.length ? Math.min(...leads) : null;
    if (headText && lead !== null && Math.abs(headText.r.left - lead) > 1 && Math.abs(headText.r.left - lead) <= 24) {
      add('heading-off-row-edge', heading, `heading text starts ${round(headText.r.left - lead)}px from its rows' content edge`);
    }
  }

  for (const el of elements) {
    const inner = Number.parseFloat(getComputedStyle(el).borderTopLeftRadius);
    const own = el.getBoundingClientRect();
    if (!(inner > 0) || inner >= Math.min(own.width, own.height) / 2 - 1 || !surface(el)) continue;
    let outer = el.parentElement;
    while (outer && outer !== root.parentElement && !(surface(outer) && Number.parseFloat(getComputedStyle(outer).borderTopLeftRadius) > 0)) {
      outer = outer.parentElement;
    }
    if (!outer || outer === root.parentElement) continue;
    const o = outer.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const inset = Math.min(r.left - o.left, r.top - o.top, o.right - r.right, o.bottom - r.bottom);
    if (inset < 0 || inset > 24) continue;
    const corner = Math.min(r.left - o.left, r.top - o.top) <= inset + 0.5 && Math.min(o.right - r.right, o.bottom - r.bottom) >= 0;
    if (!corner) continue;
    const outerRadius = Number.parseFloat(getComputedStyle(outer).borderTopLeftRadius);
    const expected = inner + inset;
    if (Math.abs(outerRadius - expected) > 3 && r.left - o.left <= 24 && r.top - o.top <= 24) {
      add('radius-not-concentric', el, `radius ${round(inner)}px at ${round(inset)}px inside a ${round(outerRadius)}px surface, expected about ${round(Math.max(outerRadius - inset, 0))}px`);
    }
  }

  return findings;
})();
