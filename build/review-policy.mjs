const START = '<!-- oneshot external-review authorization -->';
const END = '<!-- end oneshot external-review authorization -->';

export function reviewPolicy(providers) {
  if (!providers.length) return '';
  return `${START}\nThe user explicitly authorized external code review of every repository by these recipients: ${providers.join(', ')}.\n` +
    'This consent covers the external-review script and every review round. Review input must be a separate sanitized repository, without environment files, credentials, private keys, certificates, dumps, ignored files or symlink contents. These recipients are trusted only for that bounded code-review input. Authentication through their installed CLIs is part of the authorized review. A new recipient or broader data scope needs explicit user consent. Keep all other reviewer rules and managed requirements.\n' + END;
}

// Mask strings and comments so TOML-looking text inside another value cannot select a table.
function mask(text) {
  let out = '', quote = '', multi = false, arrayDepth = 0, awaitingValue = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (quote === '"' && ch === '\\') {
        out += '  '; i++; continue;
      }
      if (ch === quote && (!multi || text.slice(i, i + 3) === quote.repeat(3))) {
        let width = multi ? 3 : 1;
        if (multi) while (text[i + width] === quote) width++;
        out += ' '.repeat(width); i += width - 1; quote = ''; multi = false;
      } else out += ch === '\n' ? '\n' : ' ';
    } else if (ch === '#' ) {
      while (i < text.length && text[i] !== '\n') { out += ' '; i++; }
      if (i < text.length) out += '\n';
    } else if (ch === '"' || ch === "'") {
      awaitingValue = false;
      quote = ch; multi = text.slice(i, i + 3) === ch.repeat(3);
      const width = multi ? 3 : 1;
      out += ' '.repeat(width); i += width - 1;
    } else if (arrayDepth) {
      if (ch === '[') arrayDepth++;
      if (ch === ']') arrayDepth--;
      out += ch === '\n' ? '\n' : ' ';
    } else if (ch === '[' && awaitingValue) {
      arrayDepth = 1; awaitingValue = false; out += ' ';
    } else {
      out += ch;
      if (ch === '=') awaitingValue = true;
      else if (!/\s/.test(ch)) awaitingValue = false;
    }
  }
  return out;
}

function stringValue(text, offset) {
  while (/[ \t]/.test(text[offset] ?? '') && offset < text.length) offset++;
  const quote = text[offset];
  if (quote !== '"' && quote !== "'") throw new Error('auto_review.extra_policy must be a TOML string');
  const multi = text.slice(offset, offset + 3) === quote.repeat(3);
  const delimiter = quote.repeat(multi ? 3 : 1);
  const start = offset + delimiter.length;
  let end = start;
  while (end < text.length) {
    if (quote === '"' && text[end] === '\\') { end += 2; continue; }
    if (text.slice(end, end + delimiter.length) === delimiter) break;
    end++;
  }
  if (end >= text.length) throw new Error('unterminated auto_review.extra_policy');
  let width = delimiter.length;
  if (multi) while (text[end + width] === quote) width++;
  if (multi && width > 5) throw new Error('invalid multiline TOML string ending');
  let value = text.slice(start, end) + (multi ? quote.repeat(width - 3) : '');
  if (multi) value = value.replace(/^\r?\n/, '');
  if (quote === '"') {
    let decoded = '';
    for (let i = 0; i < value.length; i++) {
      if (value[i] !== '\\') { decoded += value[i]; continue; }
      const continuation = multi && /^[ \t]*\r?\n[ \t\r\n]*/.exec(value.slice(i + 1));
      if (continuation) { i += continuation[0].length; continue; }
      const escape = value[++i];
      const simple = { b: '\b', t: '\t', n: '\n', f: '\f', r: '\r', '"': '"', '\\': '\\' };
      if (escape in simple) decoded += simple[escape];
      else if (escape === 'u' || escape === 'U') {
        const length = escape === 'u' ? 4 : 8;
        const code = value.slice(i + 1, i + 1 + length);
        if (!new RegExp(`^[0-9a-fA-F]{${length}}$`).test(code)) throw new Error('invalid TOML Unicode escape');
        decoded += String.fromCodePoint(parseInt(code, 16)); i += length;
      } else throw new Error('unsupported TOML string escape');
    }
    value = decoded;
  }
  return { value: value.replace(/\r\n/g, '\n'), start: offset, end: end + width };
}

function keyPath(text) {
  const parts = [];
  let offset = 0;
  while (offset < text.length) {
    while (/[ \t\r]/.test(text[offset] ?? '') && offset < text.length) offset++;
    if (text[offset] === '"' || text[offset] === "'") {
      const parsed = stringValue(text, offset);
      parts.push(parsed.value); offset = parsed.end;
    } else {
      const word = /^[A-Za-z0-9_-]+/.exec(text.slice(offset));
      if (!word) return null;
      parts.push(word[0]); offset += word[0].length;
    }
    while (/[ \t\r]/.test(text[offset] ?? '') && offset < text.length) offset++;
    if (offset === text.length) break;
    if (text[offset++] !== '.') return null;
  }
  return parts;
}

function fields(text, masked, start, end) {
  return [...text.slice(start, end).matchAll(/^[ \t]*([^=\r\n]+)=/gm)]
    .filter(entry => masked[start + entry.index + entry[0].length - 1] === '=')
    .map(entry => ({ offset: start + entry.index + entry[0].length, key: keyPath(entry[1].trim()) }));
}

export function mergeReviewPolicy(text, policy) {
  const masked = mask(text);
  const tables = [...masked.matchAll(/^[ \t]*\[\[?([^\]\n]+)\]\]?[ \t\r]*$/gm)];
  const matching = tables.filter(entry => {
    const first = entry[0].indexOf('['), last = entry[0].lastIndexOf(']');
    if (entry[0][first + 1] === '[') return false;
    return JSON.stringify(keyPath(text.slice(entry.index + first + 1, entry.index + last))) === '["auto_review"]';
  });
  if (matching.length > 1) throw new Error('duplicate auto_review table');
  const table = matching[0];
  const start = table?.index ?? 0;
  const end = table ? tables.find(entry => entry.index > start)?.index ?? text.length : tables[0]?.index ?? text.length;
  const statements = fields(text, masked, start, end);
  const wanted = table ? '["extra_policy"]' : '["auto_review","extra_policy"]';
  const keys = statements.filter(entry => JSON.stringify(entry.key) === wanted);
  if (keys.length > 1) throw new Error('duplicate auto_review.extra_policy');
  if (!keys.length) {
    if (!policy) return text;
    if (table) return text.slice(0, end).replace(/\s*$/, '\n') + `extra_policy = ${JSON.stringify(policy)}\n` + text.slice(end);
    if (statements.some(entry => JSON.stringify(entry.key) === '["auto_review"]')) throw new Error('use an auto_review table instead of an inline table before building review consent');
    if (statements.some(entry => entry.key?.[0] === 'auto_review')) return text.slice(0, end).replace(/\s*$/, '\n') + `auto_review.extra_policy = ${JSON.stringify(policy)}\n` + text.slice(end);
    return text.replace(/\s*$/, '\n\n') + `[auto_review]\nextra_policy = ${JSON.stringify(policy)}\n`;
  }
  const key = keys[0];
  const parsed = stringValue(text, key.offset);
  const previous = parsed.value;
  const from = previous.indexOf(START), to = previous.indexOf(END, from);
  if (from >= 0 && to < 0) throw new Error('incomplete managed external-review policy');
  const separator = from >= 2 && previous.slice(from - 2, from) === '\n\n' ? from - 2 : from;
  const personal = from >= 0 ? previous.slice(0, separator) + previous.slice(to + END.length) : previous;
  const next = policy ? personal + (personal ? '\n\n' : '') + policy : personal;
  if (next === previous) return text;
  return text.slice(0, parsed.start) + JSON.stringify(next) + text.slice(parsed.end);
}
