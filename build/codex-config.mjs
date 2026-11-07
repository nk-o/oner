import { fields, keyPath, mask } from './review-policy.mjs';

const START = '# oner: start (written by bin/build.mjs)';
const END = '# oner: end';
const BLOCK = /^# oner: start[^\n]*\n[\s\S]*?^# oner: end[^\n]*(\n|$)/m;

function tomlValue(value) {
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(tomlValue).join(', ')}]`;
  return String(value);
}

function sections(text) {
  const masked = mask(text);
  const tables = [...masked.matchAll(/^[ \t]*\[\[?([^\]\n]+)\]\]?[ \t\r]*$/gm)].map((entry) => {
    const first = entry[0].indexOf('['), last = entry[0].lastIndexOf(']');
    const inner = text.slice(entry.index + first + 1, entry.index + last).replace(/^\[|\]$/g, '');
    return { index: entry.index, key: keyPath(inner) ?? [] };
  });
  const all = [{ index: 0, key: [] }, ...tables];
  return all.map((section, i) => ({
    ...section,
    fields: fields(text, masked, section.index, all[i + 1]?.index ?? text.length),
  }));
}

function defines(text, path) {
  const starts = (key) => path.every((part, i) => key[i] === part);
  return sections(text).some(
    (section) => starts(section.key) || section.fields.some(({ key }) => starts([...section.key, ...(key ?? [])])),
  );
}

// Writes `tables` ({ name: { key: value } }) as the build's own block at the end
// of config.toml. An empty `tables` removes the block.
export function mergeTables(text, tables) {
  const hasStart = /^# oner: start/m.test(text);
  const block = BLOCK.exec(text);
  if (hasStart && !block) throw new Error('incomplete oner block');
  const rest = block ? text.slice(0, block.index) + text.slice(block.index + block[0].length) : text;
  const names = Object.keys(tables);
  if (!names.length) return block ? rest.replace(/\s*$/, rest.trim() ? '\n' : '') : text;

  const lines = [START];
  for (const name of names) {
    const path = name.split('.');
    if (defines(rest, path)) throw new Error(`[${name}] is already set. Remove it, or change the oner setting that writes it`);
    lines.push(`[${path.map((p) => JSON.stringify(p)).join('.')}]`);
    for (const [key, value] of Object.entries(tables[name])) lines.push(`${key} = ${tomlValue(value)}`);
  }
  lines.push(END, '');
  return (rest.trim() ? rest.replace(/\s*$/, '\n\n') : '') + lines.join('\n');
}

// Sets top-level `keys` before the first table. A key in `oldOwned` that is no
// longer wanted is removed, unless its value changed since the build wrote it.
export function mergeTopKeys(text, keys, oldOwned = {}) {
  let out = text;
  const line = (key) => {
    const top = sections(out)[0];
    const field = top.fields.find((f) => JSON.stringify(f.key) === JSON.stringify([key]));
    if (!field) return null;
    const start = out.lastIndexOf('\n', field.offset - 1) + 1;
    const end = out.indexOf('\n', field.offset);
    const stop = end < 0 ? out.length : end + 1;
    const value = out.slice(field.offset, end < 0 ? out.length : end).replace(/#.*$/, '').trim();
    return { start, stop, value };
  };
  for (const [key, value] of Object.entries(oldOwned)) {
    if (key in keys) continue;
    const found = line(key);
    if (found && found.value === tomlValue(value)) out = out.slice(0, found.start) + out.slice(found.stop);
  }
  for (const [key, value] of Object.entries(keys)) {
    const text = `${key} = ${tomlValue(value)}\n`;
    const found = line(key);
    if (found) {
      out = out.slice(0, found.start) + text + out.slice(found.stop);
      continue;
    }
    const first = sections(out)[1];
    if (!first) out = (out && !out.endsWith('\n') ? out + '\n' : out) + text;
    else out = out.slice(0, first.index) + text + out.slice(first.index);
  }
  return out;
}
