#!/usr/bin/env node
// Records a short help-center video of a page in motion, headless, frame by frame: a scroll that
// drives a scroll-linked section, or a pointer that moves across hover targets. Every frame is a
// 2x screenshot, so text stays sharp, and ffmpeg joins them into an H.264 MP4.
//   node record.mjs <recording.json> [--out <dir>]
// recording.json: { baseUrl, viewport, scale, fps, hide: [css], block: [url globs], recordings: [{
//   name, url, clip?: x,y,w,h | target?: selector, grow?: px | [t,r,b,l], setup?: [js], hold?: seconds,
//   scroll?: { from: <js number>, to: <js number>, seconds },
//   pointer?: { path: [[x, y, seconds] | [selector, seconds]...], cursor: true } }] }
// A pointer path is in viewport CSS pixels; with cursor, a drawn arrow follows it, because a
// headless page has no visible pointer.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const args = process.argv.slice(2);
const listPath = resolve(args[0] ?? '');
const outIndex = args.indexOf('--out');
const out = resolve(outIndex > -1 ? args[outIndex + 1] : join(dirname(listPath), 'media'));
const list = JSON.parse(readFileSync(listPath, 'utf8'));

function loadPlaywright() {
  for (const base of [join(process.cwd(), 'package.json'), join(homedir(), '.cache', 'docs-skill', 'package.json')]) {
    try {
      return createRequire(base)('playwright');
    } catch {}
  }
  console.error('Playwright not found; see shoot.mjs for the one-time install.');
  process.exit(2);
}

const CURSOR = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22"><path d="M3 2 L3 18 L7.5 13.8 L10.6 20.4 L13.4 19.1 L10.4 12.7 L16.5 12.4 Z" fill="#111" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>`;

const { chromium } = loadPlaywright();
const browser = await chromium.launch();
mkdirSync(out, { recursive: true });
let failed = 0;
for (const rec of list.recordings) {
  const fps = rec.fps ?? list.fps ?? 30;
  const scale = rec.scale ?? list.scale ?? 2;
  const viewport = rec.viewport ?? list.viewport ?? { width: 1440, height: 900 };
  const context = await browser.newContext({ viewport, deviceScaleFactor: scale });
  for (const pattern of list.block ?? []) await context.route(pattern, (route) => route.abort());
  const frames = mkdtempSync(join(tmpdir(), 'record-'));
  try {
    const page = await context.newPage();
    await page.goto(new URL(rec.url, list.baseUrl).href, { waitUntil: 'load', timeout: 60000 });
    const hide = [...(list.hide ?? []), ...(rec.hide ?? [])];
    if (hide.length) await page.addStyleTag({ content: `${hide.join(',')}{visibility:hidden !important}` });
    for (const script of rec.setup ?? []) await page.evaluate(script);
    await page.waitForTimeout((rec.settle ?? 1.5) * 1000);
    if (rec.pointer?.cursor) {
      await page.evaluate((svg) => {
        const arrow = document.createElement('div');
        arrow.id = 'record-cursor';
        arrow.innerHTML = svg;
        arrow.style.cssText = 'position:fixed;left:0;top:0;width:22px;height:22px;z-index:2147483647;pointer-events:none;transform:translate(-100px,-100px)';
        document.documentElement.appendChild(arrow);
        addEventListener('mousemove', (event) => {
          arrow.style.transform = `translate(${event.clientX - 3}px, ${event.clientY - 2}px)`;
        }, { passive: true });
      }, CURSOR);
    }
    let clip = rec.clip ? { x: rec.clip[0], y: rec.clip[1], width: rec.clip[2], height: rec.clip[3] } : undefined;
    if (rec.target) {
      const box = await page.locator(rec.target).first().boundingBox();
      if (!box) throw new Error(`not visible: ${rec.target}`);
      // grow, a number or [top, right, bottom, left], takes in room around the target for what
      // the motion brings out of it, such as a photo that follows the pointer below the row.
      const [gt, gr, gb, gl] = [rec.grow ?? 0].flat().length === 4 ? rec.grow : Array(4).fill(rec.grow ?? 0);
      const x = Math.max(0, box.x - gl);
      const y = Math.max(0, box.y - gt);
      clip = { x, y, width: Math.min(viewport.width, box.x + box.width + gr) - x, height: Math.min(viewport.height, box.y + box.height + gb) - y };
    }
    let n = 0;
    const frame = () => page.screenshot({ path: join(frames, `${String(n++).padStart(5, '0')}.png`), clip, animations: 'allow' });
    const hold = async (seconds) => {
      for (let i = 0; i < Math.round(seconds * fps); i++) {
        await page.waitForTimeout(1000 / fps);
        await frame();
      }
    };
    await hold(rec.hold ?? 0.6);
    if (rec.scroll) {
      const from = await page.evaluate(rec.scroll.from);
      const to = await page.evaluate(rec.scroll.to);
      const count = Math.round(rec.scroll.seconds * fps);
      for (let i = 0; i <= count; i++) {
        const t = i / count;
        const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
        await page.evaluate((y) => window.scrollTo(0, y), from + (to - from) * eased);
        await page.waitForTimeout(1000 / fps);
        await frame();
      }
    }
    if (rec.pointer) {
      // A step may name an element instead of a point: its center, as the page now lays it out.
      for (const step of rec.pointer.path) {
        if (typeof step[0] === 'string') {
          const box = await page.locator(step[0]).first().boundingBox();
          if (!box) throw new Error(`not visible: ${step[0]}`);
          step.splice(0, 1, box.x + box.width / 2, box.y + box.height / 2);
        }
      }
      let [x, y] = rec.pointer.path[0];
      await page.mouse.move(x, y);
      for (const [tx, ty, seconds] of rec.pointer.path.slice(1)) {
        const count = Math.max(1, Math.round(seconds * fps));
        for (let i = 1; i <= count; i++) {
          const t = i / count;
          const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
          await page.mouse.move(x + (tx - x) * eased, y + (ty - y) * eased);
          await page.waitForTimeout(1000 / fps);
          await frame();
        }
        [x, y] = [tx, ty];
      }
    }
    await hold(rec.holdEnd ?? 0.8);
    const file = join(out, `${rec.name}.mp4`);
    // Frames are 2x; the video is the page's own width, which the help center shows sharp.
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-framerate', String(fps), '-i', join(frames, '%05d.png'),
      '-vf', `scale=${rec.width ?? 1440}:-2:flags=lanczos`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-movflags', '+faststart', file]);
    console.log(file);
  } catch (error) {
    console.error(`${rec.name}: ${error.message.split('\n')[0]}`);
    failed++;
  } finally {
    rmSync(frames, { recursive: true, force: true });
    await context.close();
  }
}
await browser.close();
process.exit(failed ? 1 : 0);
