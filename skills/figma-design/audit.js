// figma-design audit. Paste this file into a use_figma script, then end the script with
//   return await audit('<nodeId>')
// It reads only. Structural errors need context; visual warnings are leads, not style bans.

async function audit(rootId) {
  const root = await figma.getNodeByIdAsync(rootId);
  if (!root) throw new Error(`audit: node ${rootId} not found`);
  let page = root;
  while (page.type !== 'PAGE') page = page.parent;
  await figma.setCurrentPageAsync(page);

  const LIMIT = 12;
  const issues = {};
  const flag = (rule, node, note) => {
    const list = (issues[rule] ||= []);
    list.push(list.length < LIMIT ? { id: node.id, name: node.name, ...(note ? { note } : {}) } : null);
  };
  const SHAPES = new Set(['VECTOR', 'BOOLEAN_OPERATION', 'ELLIPSE', 'LINE', 'STAR', 'POLYGON', 'RECTANGLE']);
  const visible = (n) => n.visible !== false;
  const kids = (n) => ('children' in n ? n.children.filter(visible) : []);
  const isAL = (n) => 'layoutMode' in n && n.layoutMode !== 'NONE';
  const solid = (paints) =>
    Array.isArray(paints) ? paints.find((p) => p.visible !== false && p.type === 'SOLID' && (p.opacity ?? 1) > 0.05) : undefined;
  const anyPaint = (n) =>
    'fills' in n && Array.isArray(n.fills) && n.fills.some((p) => p.visible !== false && (p.opacity ?? 1) > 0.05);
  const hasFill = (n) =>
    'fills' in n && Array.isArray(n.fills) &&
    n.fills.some((p) => p.visible !== false && p.type !== 'IMAGE' && (p.opacity ?? 1) > 0.05);
  const strokeWidth = (n) => {
    if (!('strokes' in n) || !n.strokes.some((p) => p.visible !== false)) return 0;
    if ('strokeTopWeight' in n)
      return Math.max(n.strokeTopWeight, n.strokeRightWeight, n.strokeBottomWeight, n.strokeLeftWeight);
    return typeof n.strokeWeight === 'number' ? n.strokeWeight : 1;
  };
  const oneSideStroke = (n) =>
    'strokeTopWeight' in n && strokeWidth(n) > 0 &&
    [n.strokeTopWeight, n.strokeRightWeight, n.strokeBottomWeight, n.strokeLeftWeight].filter((w) => w > 0).length === 1;
  const hex = (c) => '#' + [c.r, c.g, c.b].map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
  const backdrop = (n) => {
    for (let p = n.parent; p && p.type !== 'PAGE'; p = p.parent) {
      const s = 'fills' in p && solid(p.fills);
      if (s) return hex(s.color);
    }
    return null;
  };
  // Structure without sizes: two nodes with the same shape are the same element.
  const shape = (n, depth = 3) => {
    if (n.type === 'INSTANCE') return `I:${n.mainComponent ? n.mainComponent.id : '?'}`;
    const k = kids(n);
    return depth === 0 || !k.length ? n.type : `${n.type}(${k.map((c) => shape(c, depth - 1)).join(',')})`;
  };
  // Values that must match between copies of one element. Hug and fill sizes are left out,
  // since they follow text length and the container.
  const metrics = (n) => {
    const out = [];
    const walk = (x) => {
      if (x.type === 'TEXT')
        out.push(`t${String(x.fontSize)}${typeof x.fontName === 'object' ? x.fontName.family + x.fontName.style : ''}`);
      else if (!kids(x).length && x.layoutSizingHorizontal === 'FIXED' && x.layoutSizingVertical === 'FIXED')
        out.push(`${Math.round(x.width)}x${Math.round(x.height)}`);
      if ('itemSpacing' in x && isAL(x)) out.push(`g${x.itemSpacing}p${x.paddingTop},${x.paddingLeft}`);
      if ('cornerRadius' in x && typeof x.cornerRadius === 'number' && x.cornerRadius) out.push(`r${x.cornerRadius}`);
      if (x.type !== 'INSTANCE') kids(x).forEach(walk);
    };
    walk(n);
    return out.join(' ');
  };
  const isSeparator = (n) => {
    if (/progress|track|bar|indicator|underline|cursor|caret/i.test(n.name)) return false;
    if (n.type === 'LINE') return true;
    if ((n.type === 'RECTANGLE' || n.type === 'FRAME') && !kids(n).length && hasFill(n)) {
      const thin = Math.min(n.width, n.height), long = Math.max(n.width, n.height);
      return thin <= 2 && long >= 16;
    }
    return false;
  };

  const nodes = [];
  const collect = (n) => {
    if (!visible(n)) return;
    nodes.push(n);
    if (n.type !== 'INSTANCE') kids(n).forEach(collect);
  };
  collect(root);

  // Inline separators, checked in instance text too, since overrides carry the content.
  const texts = root.type === 'TEXT' ? [root] : 'findAllWithCriteria' in root ? root.findAllWithCriteria({ types: ['TEXT'] }) : [];
  for (const t of texts)
    if (visible(t) && /\S\s*[·•|]\s*\S/.test(t.characters))
      flag('inline-separator', t, `"${t.characters.slice(0, 40)}": split into text nodes with a dot shape between`);

  const scale = { radius: new Map(), gap: new Map(), padding: new Map(), fontSize: new Map(), fontFamily: new Map(), color: new Map() };
  const count = (map, key) => map.set(key, (map.get(key) || 0) + 1);
  const bound = [];
  let solidFills = 0, boundFills = 0, textCount = 0, styledTexts = 0, stroked = 0;
  const groups = new Map();

  for (const n of nodes) {
    const k = kids(n);
    const parentAL = n.parent && isAL(n.parent);

    if (isAL(n)) {
      const overflow = k.filter((c) => c.layoutPositioning !== 'ABSOLUTE' &&
        (c.x < n.paddingLeft - 1 || c.y < n.paddingTop - 1 ||
         c.x + c.width > n.width - n.paddingRight + 1 ||
         c.y + c.height > n.height - n.paddingBottom + 1));
      if (overflow.length) flag('content-overflow', n,
        `${overflow.length} flow children exceed content bounds; check sizing and intentional scrolling`);
    }

    // 1. Containers without auto layout. Icons and illustrations made of shapes are exempt.
    if ((n.type === 'FRAME' || n.type === 'COMPONENT' || n.type === 'GROUP') && k.length >= 2 &&
        !isAL(n) && !k.every((c) => SHAPES.has(c.type))) flag('no-auto-layout', n, `${k.length} children placed by x/y`);

    // 2. Spacer nodes.
    if (parentAL && (n.type === 'FRAME' || n.type === 'RECTANGLE') && !k.length &&
        (/spacer/i.test(n.name) || (!anyPaint(n) && !strokeWidth(n) && !(n.effects || []).length)))
      flag('spacer', n, 'empty node used as a gap; use itemSpacing, padding, or gap "auto"');

    // 3. Stroke on a node that already has its own background.
    const sw = strokeWidth(n);
    // A small ring around a dot is a marker, not a border.
    const ring = n.type === 'ELLIPSE' && Math.max(n.width, n.height) <= 32;
    if (sw && !ring && !['TEXT', 'VECTOR', 'LINE', 'BOOLEAN_OPERATION'].includes(n.type) && !oneSideStroke(n)) {
      stroked++;
      const f = 'fills' in n && solid(n.fills);
      if (f && hex(f.color) !== backdrop(n)) flag('stroke-on-fill', n, `fill ${hex(f.color)} plus a ${sw}px stroke`);
    }

    // 4. Fixed size where content should set it.
    if (n.type === 'TEXT' && n.textAutoResize === 'NONE') flag('fixed-text-box', n, 'text box has a fixed height');
    // Square boxes are icon buttons and avatars, which keep a fixed size.
    if (isAL(n) && parentAL && n.layoutSizingHorizontal === 'FIXED' && n.layoutSizingVertical === 'FIXED' &&
        n.height <= 120 && Math.round(n.width) !== Math.round(n.height) && k.some((c) => c.type === 'TEXT'))
      flag('fixed-size', n, `${Math.round(n.width)}x${Math.round(n.height)} fixed; hug the content and set padding`);

    // 5. Separators between items that are not repeats of each other.
    if (isSeparator(n) && n.parent && 'children' in n.parent) {
      const sibs = kids(n.parent).filter((s) => !isSeparator(s));
      const i = kids(n.parent).indexOf(n);
      const before = kids(n.parent).slice(0, i).reverse().find((s) => !isSeparator(s));
      const after = kids(n.parent).slice(i + 1).find((s) => !isSeparator(s));
      const repeated = before && after && shape(before) === shape(after);
      if (!repeated) flag('separator', n, sibs.length ? 'neighbours differ; separate with spacing' : 'no neighbours');
    } else if (oneSideStroke(n) && n.parent && 'children' in n.parent) {
      const same = kids(n.parent).filter((s) => shape(s) === shape(n)).length;
      if (same < 2) flag('separator', n, 'one-side border on an item that has no repeated siblings');
    }

    // 6. Opacity stacked on a colour variable.
    for (const key of ['fills', 'strokes']) {
      if (!(key in n) || !Array.isArray(n[key])) continue;
      for (const p of n[key]) {
        if (p.type !== 'SOLID' || p.visible === false) continue;
        if (key === 'fills') solidFills++;
        if (p.boundVariables && p.boundVariables.color) {
          if (key === 'fills') boundFills++;
          bound.push({ n, key, id: p.boundVariables.color.id, opacity: p.opacity ?? 1 });
        }
        count(scale.color, hex(p.color));
      }
    }

    // Scale values.
    if ('cornerRadius' in n && typeof n.cornerRadius === 'number' && n.cornerRadius > 0 &&
        n.cornerRadius < Math.min(n.width, n.height) / 2) count(scale.radius, n.cornerRadius);
    if (isAL(n)) {
      if (n.primaryAxisAlignItems !== 'SPACE_BETWEEN' && k.length > 1) count(scale.gap, n.itemSpacing);
      for (const p of [n.paddingTop, n.paddingRight, n.paddingBottom, n.paddingLeft]) if (p) count(scale.padding, p);
    }
    if (n.type === 'TEXT') {
      textCount++;
      if (n.textStyleId && typeof n.textStyleId === 'string') styledTexts++;
      if (typeof n.fontSize === 'number') count(scale.fontSize, n.fontSize);
      if (typeof n.fontName === 'object') count(scale.fontFamily, n.fontName.family);
    }

    // 7. Repeated elements: group by structure.
    if ((n.type === 'FRAME' || n.type === 'GROUP') && n !== root && k.length >= 2) {
      let size = 0, drawn = 0;
      const tally = (x) => { size++; if (SHAPES.has(x.type)) drawn++; if (x.type !== 'INSTANCE') kids(x).forEach(tally); };
      tally(n);
      // Icons and logos are drawings, not layout.
      if (size >= 4 && drawn < size - 1) {
        const key = shape(n);
        (groups.get(key) || groups.set(key, []).get(key)).push(n);
      }
    }
  }

  for (const members of groups.values()) {
    if (members.length < 2) continue;
    const variants = new Map();
    for (const m of members) (variants.get(metrics(m)) || variants.set(metrics(m), []).get(metrics(m))).push(m);
    if (variants.size > 1)
      flag('same-element-different-size', members[0],
        `${members.length} copies in ${variants.size} sizes: ${[...variants.values()].map((v) => v[0].id).join(', ')}`);
    else if (members.length >= 3)
      flag('repeat-without-component', members[0], `${members.length} identical frames; make a component and use instances`);
  }

  const sorted = (map) => [...map.entries()].sort((a, b) => b[1] - a[1]).map(([v, c]) => `${v}×${c}`);
  // Resolve each consumer's mode rather than comparing every paint with the first mode.
  const variables = new Map();
  for (const id of new Set(bound.map((b) => b.id))) {
    variables.set(id, await figma.variables.getVariableByIdAsync(id));
  }
  for (const b of bound) {
    const v = variables.get(b.id);
    if (!v) continue;
    const value = v.resolveForConsumer(b.n).value;
    const a = value && typeof value === 'object' && 'a' in value ? value.a : 1;
    if (Math.abs(b.opacity - a) > 0.01)
      flag('opacity-on-variable', b.n, `${b.key} use ${v.name} (resolved alpha ${+a.toFixed(2)}) at opacity ${+b.opacity.toFixed(2)}`);
  }

  const summary = {};
  for (const [rule, list] of Object.entries(issues)) {
    summary[rule] = list.length;
    issues[rule] = list.filter(Boolean);
  }
  const structural = new Set(['no-auto-layout', 'spacer', 'fixed-text-box']);
  const errors = Object.fromEntries(Object.entries(issues).filter(([rule]) => structural.has(rule)));
  const warnings = Object.fromEntries(Object.entries(issues).filter(([rule]) => !structural.has(rule)));
  return {
    root: `${root.name} (${root.id})`,
    clean: Object.keys(errors).length === 0,
    errors,
    warnings,
    summary,
    issues,
    scale: {
      radius: sorted(scale.radius),
      gap: sorted(scale.gap),
      padding: sorted(scale.padding),
      fontSize: sorted(scale.fontSize),
      fontFamily: sorted(scale.fontFamily),
      colors: scale.color.size,
      strokedNodes: stroked,
      fillsBoundToVariables: `${boundFills}/${solidFills}`,
      textsWithStyle: `${styledTexts}/${textCount}`,
    },
  };
}
