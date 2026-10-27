// figma-design helpers. Paste this file at the top of a use_figma script that builds or edits
// layout. Every container is auto layout, sizes come from content, values come from the file's
// variables and text styles, and a repeated element is one component with instances.

const VARS = new Map((await figma.variables.getLocalVariablesAsync()).map((v) => [v.name, v]));
const TEXT_STYLES = new Map((await figma.getLocalTextStylesAsync()).map((s) => [s.name, s]));

// A token names an existing variable; literals serve values the file does not define.
function token(name, type) {
  const v = VARS.get(name);
  if (v && v.resolvedType === type) return v;
  const known = [...VARS.values()].filter((x) => x.resolvedType === type).map((x) => x.name);
  throw new Error(`No ${type} variable "${name}". Known: ${known.slice(0, 40).join(', ')}`);
}

function bindNumber(node, field, value) {
  if (typeof value === 'number') node[field] = value;
  else node.setBoundVariable(field, token(value, 'FLOAT'));
}

function paint(value) {
  if (typeof value === 'string' && value.startsWith('#')) {
    if (!/^#[0-9a-f]{6}$/i.test(value)) throw new Error(`Expected a six-digit hex color, got "${value}"`);
    const n = parseInt(value.slice(1), 16);
    return { type: 'SOLID', color: { r: (n >> 16) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 } };
  }
  return figma.variables.setBoundVariableForPaint(
    { type: 'SOLID', color: { r: 0, g: 0, b: 0 } }, 'color', token(value, 'COLOR'));
}

// Auto-layout container.
//   gap: number | token | 'auto' (space between, instead of a spacer)
//   pad: number | token | [vertical, horizontal] | [top, right, bottom, left]
//   align: cross-axis 'MIN' | 'CENTER' | 'MAX' | 'BASELINE'
//   fill, stroke, radius: token or raw value. strokeWidth defaults to 1 when stroke is supplied.
function stack(direction, o = {}) {
  const f = figma.createAutoLayout(direction, { name: o.name || direction.toLowerCase() });
  f.fills = o.fill ? [paint(o.fill)] : [];
  if (o.stroke) { f.strokes = [paint(o.stroke)]; bindNumber(f, 'strokeWeight', o.strokeWidth ?? 1); }
  if (o.gap === 'auto') f.primaryAxisAlignItems = 'SPACE_BETWEEN';
  else if (o.gap !== undefined) bindNumber(f, 'itemSpacing', o.gap);
  if (o.justify) f.primaryAxisAlignItems = o.justify;
  if (o.align) f.counterAxisAlignItems = o.align;
  if (o.wrap) { f.layoutWrap = 'WRAP'; if (o.rowGap !== undefined) bindNumber(f, 'counterAxisSpacing', o.rowGap); }
  if (o.pad !== undefined) {
    const p = Array.isArray(o.pad) ? o.pad : [o.pad];
    const [t, r, b, l] = p.length === 1 ? [p[0], p[0], p[0], p[0]] : p.length === 2 ? [p[0], p[1], p[0], p[1]] : p;
    bindNumber(f, 'paddingTop', t); bindNumber(f, 'paddingRight', r);
    bindNumber(f, 'paddingBottom', b); bindNumber(f, 'paddingLeft', l);
  }
  if (o.radius !== undefined)
    for (const c of ['topLeftRadius', 'topRightRadius', 'bottomLeftRadius', 'bottomRightRadius']) bindNumber(f, c, o.radius);
  if (o.clip) f.clipsContent = true;
  return f;
}

// Append a child and size it. w and h take 'fill', 'hug', or a number (fixed).
// abs: { x, y } takes the child out of the flow for a deliberate overlap.
function put(parent, child, o = {}) {
  parent.appendChild(child);
  if (o.abs) { child.layoutPositioning = 'ABSOLUTE'; child.x = o.abs.x; child.y = o.abs.y; }
  if (child.type === 'TEXT' && o.w === 'fill') child.textAutoResize = 'HEIGHT';
  if (typeof o.w === 'number' || typeof o.h === 'number')
    child.resize(typeof o.w === 'number' ? o.w : child.width, typeof o.h === 'number' ? o.h : child.height);
  if (o.w) child.layoutSizingHorizontal = typeof o.w === 'number' ? 'FIXED' : o.w.toUpperCase();
  if (o.h) child.layoutSizingVertical = typeof o.h === 'number' ? 'FIXED' : o.h.toUpperCase();
  if (o.grow) child.layoutGrow = 1;
  return child;
}

// Text in a text style from the file. o.font = { family, style, size } only when the file has none.
async function text(characters, o = {}) {
  const t = figma.createText();
  if (o.style) {
    const s = TEXT_STYLES.get(o.style);
    if (!s) throw new Error(`No text style "${o.style}". Known: ${[...TEXT_STYLES.keys()].join(', ')}`);
    await figma.loadFontAsync(s.fontName);
    await t.setTextStyleIdAsync(s.id);
  } else {
    const fontName = { family: o.font.family, style: o.font.style };
    await figma.loadFontAsync(fontName);
    t.fontName = fontName;
    t.fontSize = o.font.size;
  }
  t.characters = characters;
  t.textAutoResize = 'WIDTH_AND_HEIGHT';
  if (o.color) t.fills = [paint(o.color)];
  if (o.name) t.name = o.name;
  return t;
}

// One main component per element. The first call builds it into the "Components" frame on the
// current page; later calls reuse it. Returns a new instance every time.
async function instance(name, build) {
  let main = figma.currentPage.findAllWithCriteria({ types: ['COMPONENT'] }).find((c) => c.name === name);
  if (!main) {
    let shelf = figma.currentPage.children.find((n) => n.type === 'FRAME' && n.name === 'Components');
    if (!shelf) {
      shelf = stack('HORIZONTAL', { name: 'Components', gap: 40, pad: 40, wrap: true });
      const right = Math.max(0, ...figma.currentPage.children.filter((n) => n !== shelf).map((n) => n.x + n.width));
      shelf.x = right + 400;
      shelf.y = 0;
    }
    main = figma.createComponentFromNode(await build());
    main.name = name;
    shelf.appendChild(main);
  }
  return main.createInstance();
}

// Set a text layer inside an instance by layer name.
async function setText(inst, layer, characters) {
  const t = inst.findOne((n) => n.type === 'TEXT' && n.name === layer);
  if (!t) throw new Error(`No text layer "${layer}" in ${inst.name}`);
  const fonts = typeof t.fontName === 'object' ? [t.fontName] : t.getStyledTextSegments(['fontName']).map((s) => s.fontName);
  await Promise.all(fonts.map((font) => figma.loadFontAsync(font)));
  t.characters = characters;
  return t;
}

// A meta line such as "412 km · 4 stops": one text node per item and a dot shape between them,
// so the dot's size and the gap around it stay editable. Items are named "Item 1", "Item 2".
async function metaRow(items, o = {}) {
  const row = stack('HORIZONTAL', { name: o.name || 'Meta', gap: o.gap ?? 6, align: 'CENTER' });
  for (const [i, item] of items.entries()) {
    if (i) {
      const dot = figma.createEllipse();
      dot.name = 'Dot';
      dot.resize(o.dot ?? 3, o.dot ?? 3);
      dot.fills = [paint(o.dotColor || o.color)];
      put(row, dot);
    }
    put(row, await text(item, { style: o.style, font: o.font, color: o.color, name: `Item ${i + 1}` }));
  }
  return row;
}

// Place a new top-level frame to the right of a node, top-aligned, for variants.
function besideOf(anchor, node, gap = 200) {
  if (node.parent !== anchor.parent) anchor.parent.appendChild(node);
  const row = anchor.parent.children.filter((n) => n !== node && Math.abs(n.y - anchor.y) < anchor.height);
  node.x = Math.max(...row.map((n) => n.x + n.width)) + gap;
  node.y = anchor.y;
  return node;
}
