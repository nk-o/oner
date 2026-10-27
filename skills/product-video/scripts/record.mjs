#!/usr/bin/env node
// Records one shot of a web page as a 60 fps H.264 file, driven by a shot file. Format: ../references/shots.md.
//   node record.mjs <shot.json> <out.mp4>
// Writes <out>.marks.json beside the video: element boxes in video pixels, for the editor's camera.
// Needs Google Chrome (CHROME overrides the path) and ffmpeg on PATH. No npm dependencies.
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const [shotFile, outFile] = process.argv.slice(2);
if (!shotFile || !outFile) {
  console.error('usage: node record.mjs <shot.json> <out.mp4>');
  process.exit(2);
}
const shot = JSON.parse(readFileSync(shotFile, 'utf8'));
const [W, H] = shot.viewport || [1440, 810];
const DPR = shot.dpr || 1.5;
const OW = Math.round(W * DPR);
const OH = Math.round(H * DPR);
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// Requests that log a fresh browser into the store break a `shopify theme dev` proxy's session.
const BLOCK = [
  '*graphql.json*', '*sf_private_access_tokens*', '*/api/*', '*/account*', '*customer_authentication*',
  '*login_with_shop*', '*shop.app/*', '*monorail*', '*privacy-banner*', ...(shot.block || []),
];

const port = 9300 + Math.floor(Math.random() * 600);
const profile = mkdtempSync(join(tmpdir(), 'pv-chrome-'));
// A visible window renders on the GPU; headless rasterises in software and drops frames on
// heavy pages. The window must stay uncovered while recording, or Chrome throttles it.
const chrome = spawn(CHROME, [
  ...(shot.headful ?? process.env.PV_HEADFUL ? ['--window-position=40,40', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'] : ['--headless=new']),
  `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run',
  '--hide-scrollbars', '--autoplay-policy=no-user-gesture-required',
  // Paint holding keeps the old page on screen through a reload, so a recorded load would open on its end state.
  '--disable-features=PaintHolding', '--force-color-profile=srgb',
  `--window-size=${W},${H}`, 'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws;
for (let i = 0; i < 40 && !ws; i++) {
  await sleep(250);
  try {
    const tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    ws = new WebSocket(tabs.find((t) => t.type === 'page').webSocketDebuggerUrl);
  } catch {}
}
await new Promise((r) => (ws.onopen = r));

let id = 0;
const pending = new Map();
const frames = [];
const dir = mkdtempSync(join(tmpdir(), 'pv-frames-'));
let recording = false;
// A reload records from the moment the new document commits; until then the old one is still on screen.
let armed = false;
let t0 = null;
// Scripts the dev server failed to serve. A section whose module or one of its imports failed
// stays static without an error on screen, so the take is redone or flagged.
const host = new URL(shot.url).host;
const scriptUrls = new Map();
let failedScripts = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
    return;
  }
  if (process.env.PV_DEBUG) {
    if (m.method === 'Runtime.exceptionThrown') console.log('PAGE EXCEPTION', m.params.exceptionDetails.exception?.description?.split('\n')[0] || m.params.exceptionDetails.text);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') console.log('CONSOLE ERROR', m.params.args.map((a) => a.value ?? a.description).join(' ').slice(0, 300));
    if (m.method === 'Network.responseReceived' && m.params.response.status >= 400) console.log('HTTP', m.params.response.status, m.params.response.url.slice(0, 160));
    if (m.method === 'Network.loadingFailed' && !m.params.blockedReason) console.log('NET FAIL', m.params.errorText, m.params.type, scriptUrls.get(m.params.requestId) ?? '');
    if (m.method === 'Page.frameNavigated' && !m.params.frame.parentId) console.log('NAVIGATED', m.params.frame.url);
  }
  if (m.method === 'Network.requestWillBeSent' && m.params.type === 'Script') scriptUrls.set(m.params.requestId, m.params.request.url);
  if (m.method === 'Network.loadingFailed' && m.params.type === 'Script' && !m.params.blockedReason && m.params.errorText !== 'net::ERR_ABORTED') {
    const url = scriptUrls.get(m.params.requestId);
    if (url && new URL(url).host === host) failedScripts.push(url);
  }
  if (m.method === 'Page.frameNavigated' && !m.params.frame.parentId && armed && !m.params.frame.url.startsWith('about:')) {
    armed = false;
    recording = true;
  }
  if (m.method === 'Page.screencastFrame') {
    const { data, metadata, sessionId } = m.params;
    if (recording) {
      const f = join(dir, `${String(frames.length).padStart(6, '0')}.jpg`);
      writeFileSync(f, Buffer.from(data, 'base64'));
      frames.push({ f, t: metadata.timestamp });
      if (t0 === null) t0 = metadata.timestamp;
    }
    ws.send(JSON.stringify({ id: ++id, method: 'Page.screencastFrameAck', params: { sessionId } }));
  }
};
const send = (method, params = {}) =>
  new Promise((r) => {
    const i = ++id;
    pending.set(i, r);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
const ev = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || expression);
  return r.result?.result?.value;
};

await send('Network.enable');
if (process.env.PV_DEBUG) await send('Runtime.enable');
await send('Network.setBlockedURLs', { urls: BLOCK });
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: DPR, mobile: !!shot.mobile });
if (shot.colorScheme) await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: shot.colorScheme }] });
await send('Page.enable');

// Page-side helpers: hidden chrome, the drawn cursor and its click ring, and the two scroll curves.
const hideCss = (shot.hide || []).map((s) => `${s}{display:none!important}`).join('');
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `
// Lazy images that decode mid-shot pop in like a bug: load every image eagerly, including
// markup fetched later (a quick view, a drawer).
const eager = (root) => root.querySelectorAll?.('img[loading="lazy"]').forEach((i) => { i.loading = 'eager'; i.decoding = 'sync'; });
new MutationObserver((list) => list.forEach((m) => m.addedNodes.forEach((n) => { if (n.nodeType === 1) { if (n.matches?.('img[loading="lazy"]')) { n.loading = 'eager'; } eager(n); } }))).observe(document, { childList: true, subtree: true });
addEventListener('DOMContentLoaded', () => {
  eager(document);
  const st = document.createElement('style');
  st.textContent = ${JSON.stringify(hideCss)} + '#pv-cursor{position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;transform:translate(-200px,-200px)}#pv-cursor svg{display:block;transition:scale .12s}#pv-cursor.down svg{scale:.86}.pv-ring{position:fixed;z-index:2147483646;pointer-events:none;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;border:2px solid rgba(17,17,17,.55);background:rgba(255,255,255,.25);animation:pv-ring .5s cubic-bezier(.2,.8,.2,1) forwards}@keyframes pv-ring{from{scale:.3;opacity:1}to{scale:1.4;opacity:0}}';
  document.head.append(st);
  // A modal dialog hidden with CSS still makes the rest of the page inert, so pointer events
  // never reach it: close whatever opens among the hidden elements.
  ${shot.hide?.length ? `setInterval(() => document.querySelectorAll(${JSON.stringify(shot.hide.join(','))}).forEach((el) => {
    for (const d of [el, ...el.querySelectorAll('dialog[open], :popover-open')]) {
      if (d.matches('dialog[open]')) d.close(); else if (d.matches(':popover-open')) d.hidePopover();
    }
  }), 50);` : ''}
  ${shot.cursor === false ? '' : `const c = document.createElement('div'); c.id = 'pv-cursor';
  c.innerHTML = '<svg width="30" height="30" viewBox="0 0 28 28"><path d="M5 3 L5 22.5 L10.2 17.6 L13.8 25.6 L17.2 24.1 L13.6 16.3 L20.8 16.3 Z" fill="#111" stroke="#fff" stroke-width="1.7" stroke-linejoin="round"/></svg>';
  // A modal dialog or popover paints in the top layer, above any z-index. The cursor is a
  // manual popover and re-enters the top layer whenever something else opens.
  c.popover = 'manual';
  c.style.cssText += ';margin:0;border:0;padding:0;background:none;overflow:visible;inset:0 auto auto 0;width:30px;height:30px';
  document.documentElement.append(c);
  try { c.showPopover(); } catch (e) {}
  let tops = 0;
  setInterval(() => {
    const n = document.querySelectorAll('dialog[open], :popover-open').length;
    if (n !== tops) { tops = n; try { c.hidePopover(); c.showPopover(); } catch (e) {} }
  }, 50);
  addEventListener('mousemove', (e) => { c.style.transform = 'translate(' + (e.clientX - 5) + 'px,' + (e.clientY - 3) + 'px)'; }, true);
  addEventListener('mousedown', (e) => { c.classList.add('down'); const r = document.createElement('div'); r.className = 'pv-ring'; r.popover = 'manual'; r.style.left = e.clientX + 'px'; r.style.top = e.clientY + 'px'; r.style.position = 'fixed'; r.style.inset = 'auto'; document.documentElement.append(r); try { r.showPopover(); } catch (er) {} setTimeout(() => r.remove(), 600); }, true);
  addEventListener('mouseup', () => c.classList.remove('down'), true);`}
});
window.__pv = {
  // A damped spring towards the target: quick to start, soft to land, no constant-speed robot scroll.
  spring(target, stiffness = 120, ratio = 1) {
    return new Promise((done) => {
      const k = stiffness, c = 2 * ratio * Math.sqrt(k);
      let x = scrollY, v = 0, last = performance.now();
      const step = (now) => {
        const dt = Math.min(0.032, (now - last) / 1000); last = now;
        v += (-k * (x - target) - c * v) * dt; x += v * dt;
        window.scrollTo(0, x);
        if (Math.abs(v) < 2 && Math.abs(x - target) < 0.5) { window.scrollTo(0, target); done(); } else requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  },
  // A slow constant drift under everything else, so a held section never stands still.
  creep(speed) {
    cancelAnimationFrame(this._creep || 0);
    if (!speed) return;
    let last = performance.now(), y = scrollY;
    const step = (now) => { y += (speed * (now - last)) / 1000; last = now; window.scrollTo(0, y); this._creep = requestAnimationFrame(step); };
    this._creep = requestAnimationFrame(step);
  },
  // An even glide for scroll-driven sections, eased at both ends so it starts and stops like a hand.
  // Eased the whole way, for a move from one section to the next: starts soft, lands soft.
  ease(target, ms) {
    return new Promise((done) => {
      const y0 = scrollY, t0 = performance.now();
      const e = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
      const step = (now) => { const p = Math.min(1, (now - t0) / ms); window.scrollTo(0, y0 + (target - y0) * e(p)); p < 1 ? requestAnimationFrame(step) : done(); };
      requestAnimationFrame(step);
    });
  },
  glide(target, ms) {
    return new Promise((done) => {
      const y0 = scrollY, t0 = performance.now();
      const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
      const step = (now) => {
        const p = Math.min(1, (now - t0) / ms);
        window.scrollTo(0, y0 + (target - y0) * (p < 0.12 || p > 0.88 ? ease(p) : ease(0.12) + (p - 0.12) / 0.76 * (ease(0.88) - ease(0.12))));
        p < 1 ? requestAnimationFrame(step) : done();
      };
      requestAnimationFrame(step);
    });
  },
};`,
});

const pick = (sel, text, nth = 0) => `(() => {
  const all = [...document.querySelectorAll(${JSON.stringify(sel)})].filter((e) => { const r = e.getBoundingClientRect(); return r.width && r.height && getComputedStyle(e).visibility !== 'hidden'; });
  const list = ${text ? `all.filter((e) => e.textContent.trim().toLowerCase().includes(${JSON.stringify(String(text).toLowerCase())}))` : 'all'};
  return list[${nth}] || null;
})()`;

// Waits until no new resource has started for `quiet` ms and every image in view has decoded:
// a section that fetches its script or photos late would otherwise change mid-take.
async function idle(quiet = 1200, max = 12000) {
  const until = Date.now() + max;
  let count = -1, since = Date.now();
  while (Date.now() < until) {
    const n = await ev("performance.getEntriesByType('resource').length").catch(() => count);
    if (n !== count) { count = n; since = Date.now(); }
    else if (Date.now() - since >= quiet) break;
    await sleep(150);
  }
  await ev(`Promise.all([...document.images].filter((i) => { const r = i.getBoundingClientRect(); return r.bottom > -innerHeight && r.top < innerHeight * 2 && !i.complete; }).map((i) => new Promise((r) => { i.onload = i.onerror = r; setTimeout(r, 5000); })))`).catch(() => {});
}

async function load(url) {
  for (let a = 0; a < 8; a++) {
    failedScripts = [];
    await send('Page.navigate', { url });
    await sleep(3500);
    const body = await ev('document.body ? document.body.innerText.slice(0, 300) : ""').catch(() => '');
    const path = await ev('location.pathname').catch(() => '');
    // A module that failed to fetch leaves its custom element undefined and its section static.
    const missing = await ev(`${JSON.stringify(shot.ready || [])}.filter((n) => !customElements.get(n))`).catch(() => []);
    // The dev proxy answers a token error or the password page now and then; a reload clears it.
    if (!/access token/i.test(body) && path !== '/password' && !missing.length) {
      await idle();
      if (!failedScripts.length) return;
    }
    await sleep(2000);
  }
  throw new Error(`page never loaded: ${url}`);
}

const marks = {};
async function mark(name, sel, text, nth) {
  const box = await ev(`(() => { const e = ${pick(sel, text, nth)}; if (!e) return null; const r = e.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; })()`);
  if (!box) throw new Error(`mark ${name}: nothing matches ${sel}`);
  const t = frames.length ? frames[frames.length - 1].t - t0 : 0;
  marks[name] = { t: +t.toFixed(3), box: box.map((v) => Math.round(v * DPR)), size: [OW, OH] };
}

let mouse = shot.mouseStart || [W * 0.62, H * 0.58];
async function moveTo([x, y], ms = 450) {
  // A slight arc reads as a hand; a straight constant-speed line reads as a robot.
  const [x0, y0] = mouse;
  const bend = Math.min(80, Math.hypot(x - x0, y - y0) * 0.12);
  const cx = (x0 + x) / 2 + bend, cy = (y0 + y) / 2 - bend;
  const steps = Math.max(1, Math.round(ms / 16));
  for (let i = 1; i <= steps; i++) {
    const p = i / steps, e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
    const px = (1 - e) * (1 - e) * x0 + 2 * (1 - e) * e * cx + e * e * x;
    const py = (1 - e) * (1 - e) * y0 + 2 * (1 - e) * e * cy + e * e * y;
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: px, y: py });
    await sleep(16);
  }
  mouse = [x, y];
}
async function target(sel, text, nth, fx = 0.5, fy = 0.5) {
  const p = await ev(`(() => { const e = ${pick(sel, text, nth)}; if (!e) return null; const r = e.getBoundingClientRect(); return [r.left + r.width * ${fx}, r.top + r.height * ${fy}]; })()`);
  if (!p) throw new Error(`nothing matches ${sel}${text ? ` with "${text}"` : ''}`);
  return p;
}
async function scrollTarget(to, align = 0, offset = 0) {
  if (typeof to === 'number') return to;
  const v = await ev(`(() => { const e = document.querySelector(${JSON.stringify(to)}); if (!e) return null; const r = e.getBoundingClientRect(); const top = r.top + scrollY; return top + Math.max(0, e.offsetHeight - innerHeight) * ${align}; })()`);
  if (v === null) throw new Error(`scroll target missing: ${to}`);
  return Math.round(v + offset);
}

await load(shot.url);
await sleep(shot.settle ?? 2500);
if (shot.warm) {
  // One pass down the page so every section has fetched its images and run its first-view
  // work before the take, then back to where the take starts.
  await ev(`(async () => { const h = document.documentElement.scrollHeight; for (let y = 0; y < h; y += innerHeight * 0.6) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)); } await Promise.all([...document.images].filter((i) => !i.complete).map((i) => new Promise((r) => { i.onload = i.onerror = r; setTimeout(r, 4000); }))); scrollTo(0, 0); })()`);
  await sleep(1200);
}

async function run(op, o) {
  switch (op) {
    case 'reload':
      // Records the load itself: the cache is warm, so the intro plays instead of a blank wait.
      for (let a = 0; a < 6; a++) {
        // Leave the warmed page first: its finished frame would otherwise open the take.
        await send('Page.navigate', { url: 'about:blank' });
        await sleep(400);
        frames.length = 0;
        t0 = null;
        recording = false;
        armed = true;
        failedScripts = [];
        await send('Page.navigate', { url: shot.url });
        for (let w = 0; w < 100 && armed; w++) await sleep(50);
        await sleep(900);
        const body = await ev('document.body ? document.body.innerText.slice(0, 300) : ""').catch(() => '');
        if (!/access token/i.test(body)) break;
        recording = false;
        await sleep(1500);
      }
      break;
    case 'wait': await sleep(o.ms ?? o); break;
    case 'jump': await ev(`window.scrollTo(0, ${await scrollTarget(o.to, o.align, o.offset)})`); await sleep(o.settle ?? 1500); await idle(800, 8000); break;
    case 'creep': await ev(`__pv.creep(${o.speed ?? 40})`); break;
    case 'scroll': {
      await ev('__pv.creep(0)');
      // A target past the page's end would stop the curve dead mid-ease: land on the real end.
      const end = await ev('document.documentElement.scrollHeight - innerHeight');
      const y = Math.max(0, Math.min(end, o.by !== undefined ? (await ev('scrollY')) + o.by
        : o.to === 'end' ? end
        : await scrollTarget(o.to, o.align, o.offset)));
      // `speed` (CSS px per second) keeps a survey pass at one pace, so any window of it cuts cleanly.
      const ms = o.speed ? (Math.abs(y - (await ev('scrollY'))) / o.speed) * 1000 : o.ms;
      if (ms && o.curve === 'ease') await ev(`__pv.ease(${y}, ${ms})`);
      else if (ms) await ev(`__pv.glide(${y}, ${ms})`);
      else await ev(`__pv.spring(${y}, ${o.stiffness ?? 120}, ${o.ratio ?? 1})`);
      break;
    }
    case 'move': await moveTo(o.x !== undefined ? [o.x, o.y] : await target(o.sel, o.text, o.nth, o.fx, o.fy), o.ms); break;
    case 'hover':
      await moveTo(await target(o.sel, o.text, o.nth, o.fx, o.fy), o.ms);
      await sleep(o.dwell ?? 450);
      break;
    case 'click': {
      await moveTo(await target(o.sel, o.text, o.nth, o.fx, o.fy), o.ms);
      // The viewer needs to see where the cursor landed before anything changes.
      await sleep(o.dwell ?? 300);
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: mouse[0], y: mouse[1], button: 'left', clickCount: 1 });
      await sleep(110);
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: mouse[0], y: mouse[1], button: 'left', clickCount: 1 });
      if (o.after) await sleep(o.after);
      break;
    }
    case 'drag': {
      // Press at `from`, move along to each of `to` (fractions of the element's width), release.
      await moveTo(await target(o.sel, o.text, o.nth, o.from ?? 0.5, o.fy ?? 0.5), o.ms ?? 450);
      await sleep(o.dwell ?? 250);
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: mouse[0], y: mouse[1], button: 'left', clickCount: 1 });
      for (const fx of [].concat(o.to)) {
        const [x, y] = await target(o.sel, o.text, o.nth, fx, o.fy ?? 0.5);
        const steps = Math.max(1, Math.round((o.each ?? 700) / 16));
        const [x0, y0] = mouse;
        for (let i = 1; i <= steps; i++) {
          const p = i / steps, e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
          await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x0 + (x - x0) * e, y: y0 + (y - y0) * e, buttons: 1 });
          await sleep(16);
        }
        mouse = [x, y];
        await sleep(o.pause ?? 150);
      }
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: mouse[0], y: mouse[1], button: 'left', clickCount: 1 });
      break;
    }
    case 'type':
      for (const ch of o.text) {
        await send('Input.dispatchKeyEvent', { type: 'char', text: ch });
        await sleep(1000 / (o.cps ?? 11));
      }
      break;
    case 'waitFor': {
      const until = Date.now() + (o.timeout ?? 8000);
      while (Date.now() < until && !(await ev(`!!${pick(o.sel, o.text)}`))) await sleep(100);
      if (o.after) await sleep(o.after);
      break;
    }
    case 'mark': await mark(o.name, o.sel, o.text, o.nth); break;
    case 'key':
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: o.key, code: o.code ?? o.key, windowsVirtualKeyCode: o.vk ?? 27 });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: o.key, code: o.code ?? o.key, windowsVirtualKeyCode: o.vk ?? 27 });
      if (o.after) await sleep(o.after);
      break;
    case 'eval': {
      if (o.async) { send('Runtime.evaluate', { expression: o.js, awaitPromise: false }); break; }
      const v = await ev(o.js); if (o.log) console.log('eval', JSON.stringify(v)); break;
    }
    default: throw new Error(`unknown op ${op}`);
  }
}

await send('Page.startScreencast', { format: 'jpeg', quality: 90, maxWidth: OW, maxHeight: OH, everyNthFrame: 1 });
try {
  for (const s of shot.prepare || []) await run(s[0], s[1] ?? {});
  recording = shot.steps[0]?.[0] !== 'reload';
  for (const s of shot.steps) await run(s[0], s[1] ?? {});
  await sleep(shot.tail ?? 400);
} finally {
  recording = false;
  await send('Page.stopScreencast').catch(() => {});
  chrome.kill();
}

if (frames.length < 2) {
  console.error('no frames captured: the page did not change while recording');
  process.exit(1);
}
// Screencast frames arrive only when the page paints, at uneven times. Lay them on an exact
// 60 fps grid, each slot showing the latest frame painted by then. The concat demuxer would
// round the times to 1/25 s and leave every other frame a duplicate.
const grid = join(dir, 'grid');
mkdirSync(grid);
const span0 = frames[0].t;
const total = frames[frames.length - 1].t - span0 + 0.4;
for (let k = 0, j = 0; k < Math.round(total * 60); k++) {
  const t = span0 + k / 60;
  while (j + 1 < frames.length && frames[j + 1].t <= t) j++;
  symlinkSync(frames[j].f, join(grid, `${String(k).padStart(6, '0')}.jpg`));
}
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '60', '-i', join(grid, '%06d.jpg'),
  '-vf', `scale=${OW}:${OH}:flags=lanczos,format=yuv420p`, '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-r', '60', '-movflags', '+faststart', resolve(outFile)]);
writeFileSync(`${outFile}.marks.json`, JSON.stringify(marks, null, 1));
if (process.env.PV_KEEP) console.log('frames kept in', dir); else rmSync(dir, { recursive: true, force: true });
rmSync(profile, { recursive: true, force: true });
const span = frames[frames.length - 1].t - frames[0].t;
console.log(`${outFile} ${span.toFixed(1)}s, ${(frames.length / span).toFixed(0)} fps captured, ${Object.keys(marks).length} marks`);
if (failedScripts.length) {
  console.error(`BROKEN TAKE: ${failedScripts.length} script(s) failed during the take, record it again:\n  ${failedScripts.join('\n  ')}`);
}
process.exit(failedScripts.length ? 3 : 0);
