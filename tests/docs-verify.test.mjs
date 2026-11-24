import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../skills/docs/scripts/verify.mjs', import.meta.url));

function verify(t, draft, html) {
  const run = mkdtempSync(join(tmpdir(), 'oner-docs-verify-'));
  t.after(() => rmSync(run, { recursive: true, force: true }));
  mkdirSync(join(run, 'articles'));
  const url = 'data:text/html;base64,' + Buffer.from(html).toString('base64');
  writeFileSync(join(run, 'articles', 'sample.md'), `---\nurl: ${url}\n---\n${draft}\n`);
  return spawnSync(process.execPath, [script, run], { encoding: 'utf8' });
}

test('verify finds article text and images after an inline script mentions the body marker', t => {
  const draft = 'Choose a name for the pattern.\n\n![Menu](images/pattern.webp)';
  const html = `<script>document.querySelector('[data-slot="article-content"]');</script>
    <nav>Sidebar</nav>
    <div data-slot="article-content"><p>Choose a name for the pattern.</p><img src="/pattern.webp"></div>
    <nav>Next article</nav>`;
  const result = verify(t, draft, html);
  assert.equal(result.stdout.trim(), 'all 1 pages match');
  assert.equal(result.status, 0);
});

test('verify compares inline code paths and detects missing text', t => {
  const draft = "What \`npm run build\` needs to rebuild \`assets/style.css\`, and \`custom.css\` for a developer's own styles";
  const html = `<div data-slot="article-content"><p>What <code>npm run build</code> needs to rebuild
    <code>assets/style.css</code>, and <code>custom.css</code> for a developer's own styles</p></div>`;
  const result = verify(t, draft, html);
  assert.equal(result.stdout.trim(), 'all 1 pages match');
  assert.equal(result.status, 0);

  const missingText = verify(t, draft, html.replace(" for a developer's own styles", ''));
  assert.match(missingText.stdout, /sample: [1-9]\d* text chunks missing/);
  assert.equal(missingText.status, 1);

  const wrongPath = verify(t, draft, html.replace('assets/style.css', 'assets/other.css'));
  assert.match(wrongPath.stdout, /sample: [1-9]\d* text chunks missing/);
  assert.equal(wrongPath.status, 1);
});
