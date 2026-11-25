import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const source = readFileSync(new URL('../skills/design-review/scripts/geometry.js', import.meta.url), 'utf8').trim();

function loadPlaywright() {
  const require = createRequire(import.meta.url);
  for (const id of [process.env.PLAYWRIGHT_CORE, 'playwright-core', 'playwright'].filter(Boolean)) {
    try {
      return require(id);
    } catch {}
  }
  return null;
}

const playwright = loadPlaywright();
const reason = 'no playwright-core: set PLAYWRIGHT_CORE to its path to run these';

const BASE = `<style>
body { margin: 20px; width: 900px; font: 14px/20px system-ui, sans-serif; }
.av { width: 28px; height: 28px; border-radius: 50%; background: #c33; flex: none; }
.row { display: flex; gap: 10px; padding: 8px 0; }
.line { border-bottom: 1px solid #ddd; }
.panel { background: #fff; box-shadow: 0 0 0 1px #ddd; border-radius: 12px; padding: 4px; width: 300px; }
.fill { background: #eee; padding: 8px; }
</style>`;

const cases = [
  ['avatar centered on a two-line block', 'leading-visual-off-first-line',
    `<div class="row" style="align-items:center"><div class="av"></div><div><div>Name</div><div>name@example.test</div></div></div>`,
    `<div class="row" style="align-items:flex-start"><div class="av" style="margin-top:-4px"></div><div><div>Name</div><div>name@example.test</div></div></div>`],
  ['icon centered on the middle of three lines', 'leading-visual-off-first-line',
    `<div class="row" style="align-items:center"><div class="av" style="width:16px;height:16px"></div><div style="line-height:28px"><div>One</div><div>Two</div><div>Three</div></div></div>`,
    `<div class="row" style="align-items:flex-start"><div class="av" style="width:16px;height:16px;margin-top:6px"></div><div style="line-height:28px"><div>One</div><div>Two</div><div>Three</div></div></div>`],
  ['card with more padding below than above', 'padding-uneven',
    `<div style="background:#f4f4f5;border-radius:12px;width:260px;padding:12px 16px 22px">Card</div>`,
    `<div style="background:#f4f4f5;border-radius:12px;width:260px;padding:14px 16px">Card</div>`],
  ['last row divider above the section line', 'double-divider',
    `<div class="line" style="padding-bottom:12px"><div class="line">One</div><div class="line">Two</div></div>`,
    `<div class="line" style="padding-bottom:12px"><div class="line">One</div><div>Two</div></div>`],
  ['two 1px lines touching', 'double-divider',
    `<div class="line"><div class="line">One</div><div class="line">Two</div></div>`,
    `<div class="line"><div class="line">One</div><div>Two</div></div>`],
  ['last row divider inside a bordered card', 'double-divider',
    `<div style="border:1px solid #ddd;border-radius:8px;width:300px"><div class="line" style="padding:8px">One</div><div class="line" style="padding:8px">Two</div></div>`,
    `<div style="border:1px solid #ddd;border-radius:8px;width:300px"><div class="line" style="padding:8px">One</div><div style="padding:8px">Two</div></div>`],
  ['row without a flag starts its text earlier', 'row-text-off-edge',
    rows(['a', 'b', '', 'd'], 'none'),
    rows(['a', 'b', '', 'd'], 'hidden')],
  ['heading inside the list container off the rows edge', 'heading-off-row-edge',
    `<section><h4 style="margin:0">Sites</h4>${['a', 'b', 'c'].map((x) => `<div class="row" style="padding:8px 12px"><span class="av"></span><span>${x}.example</span></div>`).join('')}</section>`,
    `<section><h4 style="margin:0;padding-left:12px">Sites</h4>${['a', 'b', 'c'].map((x) => `<div class="row" style="padding:8px 12px"><span class="av"></span><span>${x}.example</span></div>`).join('')}</section>`],
  ['first row fill with the panel radius', 'radius-not-concentric',
    `<div class="panel"><div class="fill" style="border-radius:12px">First</div><div style="padding:8px">Second</div></div>`,
    `<div class="panel"><div class="fill" style="border-radius:8px">First</div><div style="padding:8px">Second</div></div>`],
  ['last row fill with the panel radius', 'radius-not-concentric',
    `<div class="panel"><div style="padding:8px">First</div><div style="padding:8px">Middle</div><div class="fill" style="border-radius:12px">Last</div></div>`,
    `<div class="panel"><div style="padding:8px">First</div><div style="padding:8px">Middle</div><div class="fill" style="border-radius:8px">Last</div></div>`],
  ['square fill in a rounded corner', 'radius-not-concentric',
    `<div class="panel" style="border-radius:20px"><div class="fill">First</div></div>`,
    `<div class="panel" style="border-radius:20px"><div class="fill" style="border-radius:16px">First</div></div>`],
];

function rows(names, slot) {
  return `<div>${names
    .map((x) => `<div class="row" style="padding:6px 12px"><span class="av"></span><span style="width:16px;height:16px;margin-left:-8px;flex:none;${x ? 'background:#36c' : `display:${slot === 'none' ? 'none' : 'block'}`}"></span><span>${x || 'c'}.example</span></div>`)
    .join('')}</div>`;
}

async function measure(page, body, rootSelector) {
  await page.setContent(`<!doctype html><meta charset="utf-8">${BASE}${body}`);
  return page.evaluate(`globalThis.geometryRoot = ${JSON.stringify(rootSelector || 'body')}; ${source}`);
}

test('geometry.js finds each planted defect and nothing on its fixed twin', { skip: playwright ? false : reason }, async () => {
  const browser = await playwright.chromium.launch();
  try {
    const page = await browser.newPage({ deviceScaleFactor: 2 });
    for (const [name, check, bad, good] of cases) {
      const found = (await measure(page, bad)).map((f) => f.check);
      assert.ok(found.includes(check), `${name}: expected ${check}, got ${JSON.stringify(found)}`);
      assert.deepEqual(await measure(page, good), [], `${name}: the fixed twin reports findings`);
    }
  } finally {
    await browser.close();
  }
});

test('geometry.js measures the root it is scoped to', { skip: playwright ? false : reason }, async () => {
  const browser = await playwright.chromium.launch();
  try {
    const page = await browser.newPage();
    const body = `<div id="sec" class="line" style="padding-bottom:12px"><div class="line">One</div><div class="line">Two</div></div>`;
    const found = (await measure(page, body, '#sec')).map((f) => f.check);
    assert.ok(found.includes('double-divider'), JSON.stringify(found));
  } finally {
    await browser.close();
  }
});

test('geometry.js keeps one repeated finding from hiding the others', { skip: playwright ? false : reason }, async () => {
  const browser = await playwright.chromium.launch();
  try {
    const page = await browser.newPage();
    const list = Array.from({ length: 250 }, (_, i) => `<div class="row" style="align-items:center"><div class="av"></div><div><div>Name ${i}</div><div>n${i}@example.test</div></div></div>`).join('');
    const found = await measure(page, `${list}<div class="line" style="padding-bottom:12px"><div class="line">One</div><div class="line">Two</div></div>`);
    assert.ok(found.some((f) => f.check === 'double-divider'), 'the divider is missing');
    assert.ok(found.some((f) => f.detail === '225 more not listed'), 'the overflow count is missing');
  } finally {
    await browser.close();
  }
});

test('geometry.js leaves a rounded control in a padded card alone', { skip: playwright ? false : reason }, async () => {
  const browser = await playwright.chromium.launch();
  try {
    const page = await browser.newPage();
    const found = await measure(page, `<div style="background:#f4f4f5;border-radius:12px;padding:16px;width:300px"><input style="border-radius:6px;width:260px;background:#fff" placeholder="Email"></div>`);
    assert.deepEqual(found, []);
  } finally {
    await browser.close();
  }
});
