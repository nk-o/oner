#!/usr/bin/env node
// Captures and annotates help-center screenshots. Format and rules: ../references/screenshots.md.
//   node shoot.mjs <shots.json> [--out <dir>] [--only <name>[,<name>]]
//   node shoot.mjs --login <url>   opens a window, saves the session when you close the tab
//   node shoot.mjs --crop <image> | --tile x,y,w,h,<image>... | --window <capture.png> --page-width <css px>
//     [--frame-width <px>] [--page-height <css px>] --box x,y,w,h [--balance] [--pad <css px>]
//     [--spotlight x,y,w,h]... [--spotlight-also x,y,w,h]... [--highlight x,y,w,h]... [--arrow x,y,w,h,from]...
//     [--marker n,x,y,w,h,at]... [--redact x,y,w,h]... [--erase x,y,w,h]... [--mark name,x,y,w,h[,pad]]...
//     [--even <css px> [--open top,right,bottom,left]] [--panel] --out <file>
//     assembles, crops, and annotates screenshots taken elsewhere (the user's own browser).
//     Repeated --spotlight boxes join into one bright area; each --spotlight-also is an area of its own.
//     --mark writes no pixels: <out>.json gets the box in percent of the finished image, grown by
//     --pad (or its own pad), for a help center that draws annotations itself.
// Playwright comes from the project's node_modules, else from ~/.cache/docs-skill, never added to the project.
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';

const SESSIONS = join(homedir(), '.cache', 'docs-skill');
const COLOR = '#F23A4C';

function loadPlaywright() {
  const bases = [join(process.cwd(), 'package.json'), join(SESSIONS, 'package.json')];
  for (const base of bases) {
    try {
      return createRequire(base)('playwright');
    } catch {}
  }
  console.error(`Playwright not found. Install it once: npm install --prefix ${SESSIONS} playwright && ${SESSIONS}/node_modules/.bin/playwright install chromium`);
  process.exit(2);
}

// Keyed by host name without the port: cookies ignore ports, and each worktree serves on its own.
const sessionPath = (url) => join(SESSIONS, `${new URL(url).hostname}.json`);

// Session files hold signed-in cookies, so only the owner may read them.
function ownerOnly(path, mode) {
  try {
    chmodSync(path, mode);
  } catch {}
}

async function login(url) {
  const { chromium } = loadPlaywright();
  mkdirSync(SESSIONS, { recursive: true, mode: 0o700 });
  ownerOnly(SESSIONS, 0o700);
  const path = sessionPath(url);
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext(existsSync(path) ? { storageState: path } : {});
  const page = await context.newPage();
  await page.goto(url);
  console.log(`Sign in, open the page you need, then close the tab (not the window). Session goes to ${path}`);
  // Closing the whole window can end the browser before a last save, so the state is also
  // saved while it is open. Closing the tab keeps the context alive for a final save.
  let saved = false;
  const save = () =>
    context
      .storageState({ path })
      .then(() => {
        saved = true;
        ownerOnly(path, 0o600);
      })
      .catch(() => {});
  const timer = setInterval(save, 2000);
  await new Promise((done) => {
    page.on('close', () => save().then(done));
    browser.on('disconnected', done);
  });
  clearInterval(timer);
  await browser.close().catch(() => {});
  if (!saved) {
    console.error(`no session saved for ${url}. Sign in, then close the tab rather than the window.`);
    process.exit(1);
  }
  console.log(`saved ${path}`);
}

// Assembles the layers into one image, crops it, balances its margins, annotates it, and
// encodes it. Every box is in the page's CSS pixels, measured from the page's top-left, the
// same frame the layers are placed in. `k` is image pixels per CSS pixel: given, or taken
// from the first layer's width.
async function render(page, input) {
  const data = await page.evaluate(async (o) => {
    const layers = await Promise.all(o.layers.map(async (layer) => {
      const image = new Image();
      image.src = layer.src;
      await image.decode();
      return { ...layer, image };
    }));
    const first = layers[0];
    // A capture of a whole browser window: the page carries a 3x3 #FF00FF marker at its top-left
    // corner, so the page lands at the marker whatever toolbars and banners sit above it.
    if (o.window) {
      const scan = document.createElement('canvas');
      scan.width = first.image.naturalWidth;
      scan.height = first.image.naturalHeight;
      const sctx = scan.getContext('2d');
      sctx.drawImage(first.image, 0, 0);
      const px = sctx.getImageData(0, 0, scan.width, scan.height).data;
      let at = null;
      for (let i = 0; i < px.length && !at; i += 4) {
        if (px[i] > 200 && px[i + 1] < 90 && px[i + 2] > 200 && px[i] - px[i + 1] > 150) at = [(i / 4) % scan.width, Math.floor(i / 4 / scan.width)];
      }
      if (!at) throw new Error('page marker not found in the window capture');
      first.x = -at[0] / o.k;
      first.y = -at[1] / o.k;
      first.w = first.image.naturalWidth / o.k;
    }
    const k = o.k ?? first.image.naturalWidth / first.w;
    const box = o.box ?? [first.x, first.y, first.w, first.image.naturalHeight / k];
    let canvas = document.createElement('canvas');
    canvas.width = Math.round(box[2] * k);
    canvas.height = Math.round(box[3] * k);
    let ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    // A sliver the layers do not cover would read as black content to the balance pass, so the
    // canvas starts as the first layer's background color.
    const probe = document.createElement('canvas').getContext('2d');
    probe.drawImage(first.image, 2, 2, 1, 1, 0, 0, 1, 1);
    const ground = probe.getImageData(0, 0, 1, 1).data;
    ctx.fillStyle = `rgb(${ground[0]},${ground[1]},${ground[2]})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (const layer of layers) {
      const h = layer.h ?? layer.image.naturalHeight / k;
      ctx.drawImage(layer.image, (layer.x - box[0]) * k, (layer.y - box[1]) * k, layer.w * k, h * k);
    }
    if (o.window && box[0] < 4 && box[1] < 4) {
      // The marker is gone from the result: painted with the pixel just right of it.
      const fill = ctx.getImageData(Math.round((6 - box[0]) * k), Math.round((1 - box[1]) * k), 1, 1).data;
      ctx.fillStyle = `rgb(${fill[0]},${fill[1]},${fill[2]})`;
      ctx.fillRect(0, 0, (4 - box[0]) * k, (4 - box[1]) * k);
    }
    let dx = -box[0] * k;
    let dy = -box[1] * k;
    let balanced = !o.balance;

    // Equal space on all four sides: the margin between the content and the side edges is
    // repeated above and below, filled with the background color.
    if (o.balance) {
      const { width: W, height: H } = canvas;
      const pixels = ctx.getImageData(0, 0, W, H).data;
      const at = (x, y) => (y * W + x) * 4;
      const bg = pixels.slice(at(2, 2), at(2, 2) + 4);
      let [minX, minY, maxX, maxY] = [W, H, -1, -1];
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const i = at(x, y);
          const diff = Math.abs(pixels[i] - bg[0]) + Math.abs(pixels[i + 1] - bg[1]) + Math.abs(pixels[i + 2] - bg[2]);
          if (diff > 36) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
      const margin = Math.min(minX, W - 1 - maxX);
      if (maxX >= 0 && margin > 4) {
        const next = document.createElement('canvas');
        next.width = maxX - minX + 1 + margin * 2;
        next.height = maxY - minY + 1 + margin * 2;
        const nctx = next.getContext('2d');
        nctx.fillStyle = `rgb(${bg[0]},${bg[1]},${bg[2]})`;
        nctx.fillRect(0, 0, next.width, next.height);
        nctx.drawImage(canvas, minX - margin, minY - margin, next.width, next.height, 0, 0, next.width, next.height);
        dx -= minX - margin;
        dy -= minY - margin;
        canvas = next;
        ctx = nctx;
        balanced = true;
      }
    }

    // Even padding: the content is found inside the box, the edge noise a crop catches is dropped
    // (thin lines along an edge, a scrollbar or border down a side, and with `panel` the tinted
    // header strips of an editor sidebar), and the same room goes on all four sides. Content
    // still touching an edge is cut by the box, which fails the shot instead of shipping it.
    let cut = [];
    if (o.even != null) {
      const { width: W, height: H } = canvas;
      const pixels = ctx.getImageData(0, 0, W, H).data;
      const counts = new Map();
      for (let i = 0; i < pixels.length; i += 4 * 7) {
        const key = (pixels[i] << 16) | (pixels[i + 1] << 8) | pixels[i + 2];
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      const bgKey = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
      const bg = [(bgKey >> 16) & 255, (bgKey >> 8) & 255, bgKey & 255];
      const at = (x, y) => (y * W + x) * 4;
      const diff = (i) => Math.abs(pixels[i] - bg[0]) + Math.abs(pixels[i + 1] - bg[1]) + Math.abs(pixels[i + 2] - bg[2]);
      const ink = (i) => diff(i) > 36;
      const tint = (i) => diff(i) > 6;
      const rowInk = new Array(H).fill(0);
      const rowTint = new Array(H).fill(0);
      const colInk = new Array(W).fill(0);
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const i = at(x, y);
          if (ink(i)) {
            rowInk[y]++;
            colInk[x]++;
          }
          if (tint(i)) rowTint[y]++;
        }
      }
      // A row is noise when it spans the width as a thin line (a divider, a border) or, in an
      // editor panel, as a tinted strip of any height (a header). A thick band is content.
      const spans = (y) => rowInk[y] > 0.85 * W;
      const thin = new Array(H).fill(false);
      for (let y = 0; y < H; ) {
        let end = y;
        while (end < H && spans(end)) end++;
        if (end > y) {
          if (end - y <= 3 * k) for (let i = y; i < end; i++) thin[i] = true;
          y = end;
        } else y++;
      }
      const noiseRow = (y) => thin[y] || (o.panel && rowTint[y] > 0.85 * W);
      // A column is noise when it is a narrow run down a side: a scrollbar or a window border.
      const sideRun = (from, step) => {
        let x = from;
        while (x >= 0 && x < W && colInk[x] > 0.3 * H) x += step;
        return Math.abs(x - from) <= 16 * k ? x : from;
      };
      let left = sideRun(0, 1);
      let right = sideRun(W - 1, -1);
      // Leading and trailing rows that are noise or blank go. A tinted strip's own text sits on
      // rows the tint spans, so the strip goes whole.
      let top = 0;
      let bottom = H - 1;
      const blank = (y) => rowInk[y] === 0;
      // A line followed inward by blank space is a divider; one followed by content is the edge
      // of a box, such as a field's border, and stays.
      const trimRows = (from, step) => {
        let y = from;
        let last = from;
        while (y >= 0 && y < H) {
          if (blank(y)) {
            y += step;
            continue;
          }
          if (!noiseRow(y)) break;
          let end = y;
          while (end >= 0 && end < H && noiseRow(end)) end += step;
          if (end >= 0 && end < H && !blank(end) && !thin[y]) {
            // a tinted strip (panel header) goes with whatever touches it
          } else if (end >= 0 && end < H && !blank(end)) break;
          last = end;
          y = end;
        }
        return last;
      };
      top = trimRows(0, 1);
      bottom = trimRows(H - 1, -1);
      let [minX, minY, maxX, maxY] = [W, H, -1, -1];
      // A light card on a white page is content too, so the bounds take any visible tint.
      for (let y = top; y <= bottom; y++) {
        for (let x = left; x <= right; x++) {
          if (diff(at(x, y)) > 12) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
      if (maxX < 0) throw new Error('no content inside the box');
      // An open side is one the content runs past on purpose, such as a carousel's next card:
      // the image keeps it flush with that edge instead of failing the shot.
      const open = new Set(o.open ?? []);
      const near = 2 * k;
      if (open.has('top')) minY = top;
      else if (minY - top < near) cut.push('top');
      if (open.has('bottom')) maxY = bottom;
      else if (bottom - maxY < near) cut.push('bottom');
      if (open.has('left')) minX = left;
      else if (minX - left < near) cut.push('left');
      if (open.has('right')) maxX = right;
      else if (right - maxX < near) cut.push('right');
      const room = Math.round(o.even * k);
      const pad = (side) => (open.has(side) ? 0 : room);
      const next = document.createElement('canvas');
      next.width = maxX - minX + 1 + pad('left') + pad('right');
      next.height = maxY - minY + 1 + pad('top') + pad('bottom');
      const nctx = next.getContext('2d');
      nctx.fillStyle = `rgb(${bg[0]},${bg[1]},${bg[2]})`;
      nctx.fillRect(0, 0, next.width, next.height);
      nctx.drawImage(canvas, minX, minY, maxX - minX + 1, maxY - minY + 1, pad('left'), pad('top'), maxX - minX + 1, maxY - minY + 1);
      dx -= minX - pad('left');
      dy -= minY - pad('top');
      canvas = next;
      ctx = nctx;
      balanced = true;
    }

    const place = (r) => ({ x: r[0] * k + dx, y: r[1] * k + dy, w: r[2] * k, h: r[3] * k });
    const shadow = (blur) => {
      ctx.shadowColor = 'rgba(0,0,0,0.22)';
      ctx.shadowBlur = blur * k;
      ctx.shadowOffsetY = 1 * k;
    };

    // Erasing: a browser artifact that is not the product, such as a password manager's button
    // inside a field, is painted over with the color just left of it, so the field reads empty.
    for (const area of o.erase ?? []) {
      const r = place(area);
      const sample = ctx.getImageData(Math.max(0, Math.round(r.x - 2 * k)), Math.round(r.y + r.h / 2), 1, 1).data;
      ctx.fillStyle = `rgb(${sample[0]},${sample[1]},${sample[2]})`;
      ctx.fillRect(r.x, r.y, r.w, r.h);
    }

    // Redaction: a part the reader must not see, such as a name or an address, is blurred past
    // reading. Blur, not a solid box, so the screen still reads as the same screen.
    for (const area of o.redact ?? []) {
      const r = place(area);
      ctx.save();
      ctx.beginPath();
      ctx.rect(r.x, r.y, r.w, r.h);
      ctx.clip();
      ctx.filter = `blur(${10 * k}px)`;
      for (let pass = 0; pass < 3; pass++) ctx.drawImage(canvas, 0, 0);
      ctx.restore();
    }

    // Spotlight: everything outside the bright areas is dimmed. `spotlight` is one area, its
    // boxes joined into the one rectangle that holds them all, such as a mega menu panel and the
    // header it opens from. `spotlights` adds separate areas, such as a setting in the sidebar
    // and the part of the preview it changes, each kept apart so the dim shows between them.
    const areas = [o.spotlight, ...(o.spotlights ?? [])].filter(Boolean).map((area) => {
      const boxes = Array.isArray(area[0]) ? area : [area];
      const x1 = Math.min(...boxes.map((b) => b[0]));
      const y1 = Math.min(...boxes.map((b) => b[1]));
      const x2 = Math.max(...boxes.map((b) => b[0] + b[2]));
      const y2 = Math.max(...boxes.map((b) => b[1] + b[3]));
      return place([x1, y1, x2 - x1, y2 - y1]);
    });
    if (areas.length) {
      // Room around each part, so the spotlight frames it rather than touching its edges.
      const pad = (o.pad ?? 24) * k;
      const radius = (o.radius ?? 14) * k;
      const dim = document.createElement('canvas');
      dim.width = canvas.width;
      dim.height = canvas.height;
      const dctx = dim.getContext('2d');
      dctx.fillStyle = `rgba(17,17,20,${o.dim ?? 0.5})`;
      dctx.fillRect(0, 0, dim.width, dim.height);
      dctx.globalCompositeOperation = 'destination-out';
      dctx.fillStyle = '#000';
      for (const r of areas) {
        dctx.beginPath();
        dctx.roundRect(r.x - pad, r.y - pad, r.w + pad * 2, r.h + pad * 2, radius);
        dctx.fill();
      }
      ctx.drawImage(dim, 0, 0);
      if (o.ring) {
        ctx.save();
        ctx.strokeStyle = o.color;
        ctx.lineWidth = 2.5 * k;
        for (const r of areas) {
          ctx.beginPath();
          ctx.roundRect(r.x - pad, r.y - pad, r.w + pad * 2, r.h + pad * 2, radius);
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    for (const outline of o.highlights ?? []) {
      const r = place(outline);
      const pad = Math.min(o.pad ?? 24, 8) * k;
      ctx.save();
      shadow(3);
      ctx.strokeStyle = o.color;
      ctx.lineWidth = 2.5 * k;
      ctx.beginPath();
      ctx.roundRect(r.x - pad, r.y - pad, r.w + pad * 2, r.h + pad * 2, 4 * k);
      ctx.stroke();
      ctx.restore();
    }

    // A straight arrow on the line through the target's center, tapered from a thin tail to a
    // notched head, so its point lands on the target and nowhere beside it.
    for (const arrow of o.arrows ?? []) {
      const r = place(arrow.to);
      const dirs = { left: [-1, 0], right: [1, 0], top: [0, -1], bottom: [0, 1], 'top-left': [-1, -1], 'top-right': [1, -1], 'bottom-left': [-1, 1], 'bottom-right': [1, 1] };
      let [ux, uy] = dirs[arrow.from ?? 'left'] ?? dirs.left;
      const norm = Math.hypot(ux, uy);
      ux /= norm;
      uy /= norm;
      const cx = r.x + r.w / 2;
      const cy = r.y + r.h / 2;
      const reach = Math.min(ux ? r.w / 2 / Math.abs(ux) : Infinity, uy ? r.h / 2 / Math.abs(uy) : Infinity);
      const tip = { x: cx + ux * (reach + 4 * k), y: cy + uy * (reach + 4 * k) };
      const length = (arrow.length || 110) * k;
      const tail = { x: tip.x + ux * length, y: tip.y + uy * length };
      const head = 24 * k;
      const half = 11 * k;
      const notch = 6 * k;
      const px = -uy;
      const py = ux;
      const base = { x: tip.x + ux * head, y: tip.y + uy * head };
      const neck = { x: base.x - ux * notch, y: base.y - uy * notch };
      const shaftEnd = 2.6 * k;
      const shaftStart = 0.9 * k;
      ctx.fillStyle = o.color;
      ctx.beginPath();
      ctx.moveTo(tail.x + px * shaftStart, tail.y + py * shaftStart);
      ctx.lineTo(neck.x + px * shaftEnd, neck.y + py * shaftEnd);
      ctx.lineTo(base.x + px * half, base.y + py * half);
      ctx.lineTo(tip.x, tip.y);
      ctx.lineTo(base.x - px * half, base.y - py * half);
      ctx.lineTo(neck.x - px * shaftEnd, neck.y - py * shaftEnd);
      ctx.lineTo(tail.x - px * shaftStart, tail.y - py * shaftStart);
      ctx.closePath();
      ctx.fill();
    }

    // Numbered markers sit beside their target, never on it.
    for (const marker of o.markers ?? []) {
      const r = place(marker.on);
      const radius = 12 * k;
      const gap = radius + 5 * k;
      const spots = {
        'top-left': [r.x, r.y], 'top-right': [r.x + r.w, r.y],
        'bottom-left': [r.x, r.y + r.h], 'bottom-right': [r.x + r.w, r.y + r.h],
        left: [r.x - gap, r.y + r.h / 2], right: [r.x + r.w + gap, r.y + r.h / 2],
        top: [r.x + r.w / 2, r.y - gap], bottom: [r.x + r.w / 2, r.y + r.h + gap],
      };
      const [x, y] = spots[marker.at ?? 'left'] ?? spots.left;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = o.color;
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = `600 ${radius}px -apple-system, "SF Pro Display", system-ui, "Segoe UI", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(marker.n), x, y + 0.8 * k);
    }

    // Named boxes in percent of the finished image, after the crop and the balance moved it, with
    // the same room around the part a drawn spotlight gets, so a mark never runs along its edges.
    const pct = (v, size) => Math.round((v / size) * 1000) / 10;
    const outside = [];
    const boxes = Object.fromEntries(Object.entries(o.marks ?? {}).map(([name, mark]) => {
      const r = place(mark.area);
      // A part the frame cuts, often after a scroll that went elsewhere, gives numbers no mark can use.
      if (r.x < -k || r.y < -k || r.x + r.w > canvas.width + k || r.y + r.h > canvas.height + k) outside.push(name);
      const room = (mark.pad ?? o.pad ?? 24) * k;
      const x1 = Math.max(0, r.x - room);
      const y1 = Math.max(0, r.y - room);
      const x2 = Math.min(canvas.width, r.x + r.w + room);
      const y2 = Math.min(canvas.height, r.y + r.h + room);
      return [name, { x: pct(x1, canvas.width), y: pct(y1, canvas.height), w: pct(x2 - x1, canvas.width), h: pct(y2 - y1, canvas.height) }];
    }));
    return { url: canvas.toDataURL(`image/${o.format}`, o.quality), balanced, cut, boxes, outside, width: canvas.width, height: canvas.height };
  }, input);
  if (data.outside.length) throw new Error(`boxes not inside the image: ${data.outside.join(', ')}; the shot missed them`);
  if (data.cut.length) throw new Error(`content touches the ${data.cut.join(', ')} edge of the box, so the box cuts it; move that edge into empty space`);
  if (!data.balanced) console.error('balance skipped: the content touches a side edge, so the crop box cuts into it');
  return { image: Buffer.from(data.url.split(',')[1], 'base64'), boxes: data.boxes, width: data.width, height: data.height };
}

// Beside the image, its size and the boxes the article's own annotations will mark.
function writeBoxes(file, result) {
  if (!Object.keys(result.boxes).length) return;
  const path = file.replace(/\.[a-z]+$/, '.json');
  writeFileSync(path, `${JSON.stringify({ width: result.width, height: result.height, boxes: result.boxes }, null, 1)}\n`);
  console.log(path);
}

// Waits for fonts and for the images on screen. A lazy image off screen never loads, so it is
// left out, and the wait gives up after 10 seconds rather than hang the run.
async function settle(page) {
  await page.evaluate(async () => {
    const onScreen = (image) => {
      const box = image.getBoundingClientRect();
      return box.bottom > 0 && box.top < innerHeight && box.width > 0;
    };
    const pending = [...document.images].filter((image) => !image.complete && onScreen(image));
    const loaded = Promise.all([
      document.fonts.ready,
      ...pending.map((image) => new Promise((done) => {
        image.addEventListener('load', done, { once: true });
        image.addEventListener('error', done, { once: true });
      })),
    ]);
    await Promise.race([loaded, new Promise((done) => setTimeout(done, 10000))]);
  });
}

async function rect(scope, selector) {
  const box = await scope.locator(selector).first().boundingBox();
  if (!box) throw new Error(`not visible: ${selector}`);
  return [box.x, box.y, box.width, box.height];
}

// A list of selectors is the one box that holds them all, such as a row of cards with no parent
// of their own, or a card and the badge over its corner.
async function joined(scope, selectors) {
  const parts = await Promise.all([selectors].flat().map((one) => rect(scope, one)));
  const x = Math.min(...parts.map((b) => b[0]));
  const y = Math.min(...parts.map((b) => b[1]));
  return [x, y, Math.max(...parts.map((b) => b[0] + b[2])) - x, Math.max(...parts.map((b) => b[1] + b[3])) - y];
}

async function runAction(scope, action) {
  if (action.click) await scope.locator(action.click).first().click();
  if (action.hover) await scope.locator(action.hover).first().hover();
  if (action.scroll) await scope.locator(action.scroll).first().scrollIntoViewIfNeeded();
  // A footer revealed from under the page counts as in view, so it needs the page scrolled to its end.
  if (action.scrollTo === 'bottom') await scope.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  if (action.fill) await scope.locator(action.fill[0]).first().fill(action.fill[1]);
  // Focus opens what :focus-within shows, such as a menu, without a click that would follow a link.
  if (action.focus) await scope.locator(action.focus).first().focus();
  // A short script for a state no user action reaches in a headless browser, such as an indicator
  // that stays hidden after a programmatic scroll.
  if (action.eval) await scope.evaluate(action.eval);
  if (action.wait) await scope.waitForTimeout(action.wait);
}

async function shoot(listPath, out, only) {
  const list = JSON.parse(readFileSync(listPath, 'utf8'));
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch();
  const color = list.highlightColor ?? COLOR;
  const format = list.format ?? 'webp';
  mkdirSync(out, { recursive: true });
  let failed = 0;

  const unknown = only?.filter((name) => !list.shots.some((shot) => shot.name === name)) ?? [];
  for (const name of unknown) {
    console.error(`${name}: no shot with this name in ${listPath}`);
    failed++;
  }

  const drawn = ['spotlight', 'spotlights', 'highlight', 'highlights', 'arrows', 'markers'];
  for (const shot of list.shots) {
    if (only && !only.includes(shot.name)) continue;
    const pixels = drawn.filter((key) => shot[key]);
    if (list.annotations === 'platform' && pixels.length) {
      console.error(`${shot.name}: the help center draws annotations, so ${pixels.join(', ')} go in the article; measure them with boxes`);
      failed++;
      continue;
    }
    let url;
    try {
      url = new URL(shot.url, list.baseUrl).href;
    } catch {
      console.error(`${shot.name}: "${shot.url}" is not a full URL and the list has no baseUrl`);
      failed++;
      continue;
    }
    const host = shot.session ?? list.session;
    const session = host ? sessionPath(host.includes('://') ? host : `https://${host}`) : null;
    if (session && !existsSync(session)) {
      console.error(`${shot.name}: no session for ${host}, run: node shoot.mjs --login <url>`);
      failed++;
      continue;
    }
    const scale = shot.scale ?? list.scale ?? 2;
    const context = await browser.newContext({
      viewport: shot.viewport ?? list.viewport ?? { width: 1440, height: 900 },
      deviceScaleFactor: scale,
      // Reduced motion finishes entrance animations before the shot. A shot of an effect that
      // is itself motion, such as a marquee or scroll-lit text, sets `motion` to keep it running.
      reducedMotion: shot.motion ? 'no-preference' : 'reduce',
      colorScheme: 'light',
      ...(session && { storageState: session }),
    });
    // A request a shot must never make, such as one that would replace a dev proxy's session.
    for (const pattern of [...(list.block ?? []), ...(shot.block ?? [])]) await context.route(pattern, (route) => route.abort());
    try {
      const page = await context.newPage();
      page.setDefaultTimeout(15000);
      await page.goto(url, { waitUntil: 'load', timeout: 60000 });
      // A missing session redirects to a sign-in or a store password page, which would
      // otherwise come back as a clean shot of the wrong screen.
      const asked = new URL(url);
      const landed = new URL(page.url());
      if (landed.host !== asked.host || (/\/(password|login|sign_?in)\b/.test(landed.pathname) && landed.pathname !== asked.pathname)) {
        throw new Error(`landed on ${landed.host}${landed.pathname}: sign in with --login <url>, or shoot it in the user's browser`);
      }
      let scope = page;
      if (shot.frame) {
        const frame = await page.waitForSelector(shot.frame, { timeout: 30000 });
        scope = await frame.contentFrame();
      }
      if (shot.waitFor) await scope.waitForSelector(shot.waitFor, { state: 'visible', timeout: 30000 });
      for (const action of shot.actions ?? []) await runAction(scope, action);
      const hide = [...(list.hide ?? []), ...(shot.hide ?? [])];
      if (hide.length) {
        await scope.addStyleTag({ content: `${hide.join(',')}{visibility:hidden !important}` });
      }
      // Isolate leaves only the target's section visible, so the room grow adds around it is the
      // page's own background rather than the edges of the sections next to it.
      if (shot.target && shot.isolate) {
        await scope.evaluate((selectors) => {
          const targets = selectors.map((selector) => document.querySelector(selector)).filter(Boolean);
          const target = targets[0];
          for (const section of document.querySelectorAll('.shopify-section, header, footer')) {
            if (!targets.some((one) => section.contains(one) || one.contains(section))) section.style.setProperty('opacity', '0', 'important');
          }
          // A page can paint its own canvas dark, such as behind a footer that slides out from under
          // it, so the room around the target takes the color of the nearest painted box around it.
          let paint = '#fff';
          for (let node = target; node && node !== document.documentElement; node = node.parentElement) {
            const color = getComputedStyle(node).backgroundColor;
            if (color && color !== 'rgba(0, 0, 0, 0)' && color !== 'transparent') {
              paint = color;
              break;
            }
          }
          for (const root of [document.documentElement, document.body]) root.style.setProperty('background', paint, 'important');
          // A modal's backdrop sits behind the target too, as does any dimming layer of the overlay.
          const clear = document.createElement('style');
          clear.textContent = '::backdrop{background:transparent !important}';
          document.head.append(clear);
        }, [shot.target].flat());
      }
      if (shot.target) await scope.locator([shot.target].flat()[0]).first().scrollIntoViewIfNeeded();
      await settle(scope);
      await page.waitForTimeout(shot.delay ?? 300);

      // Boxes come back in viewport pixels, frames included, which is what the clip takes.
      const view = page.viewportSize();
      const highlights = [shot.highlight, ...(shot.highlights ?? [])].filter(Boolean);
      const marks = {
        spotlight: shot.spotlight ? await Promise.all([shot.spotlight].flat().map((selector) => rect(scope, selector))) : null,
        spotlights: await Promise.all((shot.spotlights ?? []).map((area) => Promise.all([area].flat().map((selector) => rect(scope, selector))))),
        redact: await Promise.all((shot.redact ?? []).map((selector) => rect(scope, selector))),
        highlights: await Promise.all(highlights.map((selector) => rect(scope, selector))),
        arrows: await Promise.all((shot.arrows ?? []).map(async (a) => ({ ...a, to: await rect(scope, a.to) }))),
        markers: await Promise.all((shot.markers ?? []).map(async (m) => ({ ...m, on: await rect(scope, m.on) }))),
        marks: Object.fromEntries(await Promise.all(Object.entries(shot.boxes ?? {}).map(async ([name, box]) => {
          const { selector, pad } = typeof box === 'string' || Array.isArray(box) ? { selector: box } : box;
          return [name, { area: await joined(scope, selector), pad }];
        }))),
      };
      let region = shot.target ? await joined(scope, shot.target) : shot.clip ? [shot.clip.x, shot.clip.y, shot.clip.width, shot.clip.height] : [0, 0, view.width, view.height];
      // A section box often ends at its content, so an even crop of it has no room to find; grow
      // takes in that much of the page around the target first, inside the viewport.
      if (shot.target && shot.grow) {
        const [gt, gr, gb, gl] = [shot.grow].flat().length === 4 ? shot.grow : Array(4).fill(shot.grow);
        const x = Math.max(0, region[0] - gl);
        const y = Math.max(0, region[1] - gt);
        region = [x, y, Math.min(view.width, region[0] + region[2] + gr) - x, Math.min(view.height, region[1] + region[3] + gb) - y];
      }
      if (shot.target && (highlights.length || marks.arrows.length || marks.markers.length)) {
        // Annotations sit outside the element they mark, so a target shot leaves room for them.
        const room = marks.arrows.length ? 150 : 28;
        const x = Math.max(0, region[0] - room);
        const y = Math.max(0, region[1] - room);
        region = [x, y, Math.min(view.width, region[0] + region[2] + room) - x, Math.min(view.height, region[1] + region[3] + room) - y];
      }
      const png = await page.screenshot({ clip: { x: region[0], y: region[1], width: region[2], height: region[3] }, animations: 'disabled' });
      const result = await render(page, {
        layers: [{ src: `data:image/png;base64,${png.toString('base64')}`, x: region[0], y: region[1], w: region[2], h: region[3] }],
        k: scale,
        box: region,
        balance: shot.balance ?? list.balance ?? false,
        even: shot.even ?? list.even,
        panel: shot.panel ?? list.panel,
        open: shot.open,
        pad: shot.pad ?? list.pad,
        radius: shot.radius ?? list.radius,
        dim: shot.dim ?? list.dim,
        ring: shot.ring ?? list.ring,
        ...marks,
        color,
        format,
        quality: list.quality ?? 0.92,
      });
      const file = join(out, `${shot.name}.${format}`);
      writeFileSync(file, result.image);
      console.log(`${file}`);
      writeBoxes(file, result);
    } catch (error) {
      console.error(`${shot.name}: ${error.message.split('\n')[0]}`);
      failed++;
    } finally {
      await context.close();
    }
  }
  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
}

const mime = (path) => (path.endsWith('.png') ? 'png' : path.endsWith('.webp') ? 'webp' : 'jpeg');
const dataUrl = (path) => `data:image/${mime(path)};base64,${readFileSync(path).toString('base64')}`;

// A screenshot from elsewhere: one whole-page image, tiles placed where they were taken, or a
// capture of a whole browser window whose page carries the corner marker. Tile boxes are in the
// screenshot tool's frame pixels; `frameWidth` over `pageWidth` turns them into CSS pixels.
async function crop(options) {
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const ratio = options.pageWidth / (options.frameWidth ?? options.pageWidth);
  const layers = options.tiles.length
    ? options.tiles.map(([x, y, w, h, path]) => ({ src: dataUrl(resolve(path)), x: x * ratio, y: y * ratio, w: w * ratio, h: h * ratio }))
    : [{ src: dataUrl(options.input), x: 0, y: 0, w: options.pageWidth }];
  const result = await render(page, {
    layers,
    window: options.window,
    k: options.window ? options.scale : undefined,
    box: options.box ?? (options.window ? [0, 0, options.pageWidth, options.pageHeight] : undefined),
    balance: options.balance,
    even: options.even,
    open: options.open,
    panel: options.panel,
    pad: options.pad,
    radius: options.radius,
    dim: options.dim,
    ring: options.ring,
    redact: options.redact,
    erase: options.erase,
    spotlight: options.spotlight,
    spotlights: options.spotlights,
    highlights: options.highlights,
    arrows: options.arrows.map((a) => ({ to: a.slice(0, 4), from: a[4], length: a[5] })),
    markers: options.markers.map((m) => ({ n: m[0], on: m.slice(1, 5), at: m[5] })),
    marks: Object.fromEntries(options.marks.map((m) => [m[0], { area: m.slice(1, 5), pad: m[5] === undefined ? undefined : Number(m[5]) }])),
    color: options.color,
    format: options.out.endsWith('.png') ? 'png' : 'webp',
    quality: 0.92,
  });
  await browser.close();
  mkdirSync(dirname(options.out), { recursive: true });
  writeFileSync(options.out, result.image);
  console.log(options.out);
  writeBoxes(options.out, result);
}

const args = process.argv.slice(2);
const flag = (name) => {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
};
const all = (name) => args.flatMap((arg, index) => (arg === name ? [args[index + 1]] : []));
const values = (value) => value.split(',').map((part) => (part === '' || Number.isNaN(Number(part)) ? part : Number(part)));
const usage = 'Usage: node shoot.mjs <shots.json> [--out <dir>] [--only <name>] | --login <url> | --crop <image> | --tile x,y,w,h,<image>... | --window <capture.png> [--scale 2] --page-width <px> [--page-height <px>] [--frame-width <px>] [--box x,y,w,h] [--balance] [--pad <px>] [--spotlight x,y,w,h]... [--spotlight-also x,y,w,h]... [--highlight x,y,w,h]... [--arrow x,y,w,h,from[,length]]... [--marker n,x,y,w,h,at]... [--redact x,y,w,h]... [--mark name,x,y,w,h[,pad]]... --out <file>. Repeated --spotlight boxes join into one area; --spotlight-also adds a separate one.';
if (flag('--login')) {
  await login(flag('--login'));
} else if (flag('--crop') || flag('--window') || all('--tile').length) {
  const spotlights = all('--spotlight').map(values);
  await crop({
    input: resolve(flag('--crop') ?? flag('--window') ?? '.'),
    window: Boolean(flag('--window')),
    scale: Number(flag('--scale') ?? 2),
    tiles: all('--tile').map(values),
    pageWidth: Number(flag('--page-width')),
    pageHeight: Number(flag('--page-height') ?? 900),
    frameWidth: flag('--frame-width') && Number(flag('--frame-width')),
    box: flag('--box') && values(flag('--box')),
    balance: args.includes('--balance'),
    even: flag('--even') != null ? Number(flag('--even')) : args.includes('--panel') ? 24 : undefined,
    panel: args.includes('--panel'),
    open: flag('--open')?.split(','),
    pad: flag('--pad') && Number(flag('--pad')),
    radius: flag('--radius') && Number(flag('--radius')),
    dim: flag('--dim') && Number(flag('--dim')),
    ring: args.includes('--ring'),
    redact: all('--redact').map(values),
    erase: all('--erase').map(values),
    spotlight: spotlights.length > 1 ? spotlights : spotlights[0],
    spotlights: all('--spotlight-also').map(values),
    highlights: all('--highlight').map(values),
    arrows: all('--arrow').map(values),
    markers: all('--marker').map(values),
    marks: all('--mark').map(values),
    color: flag('--color') ?? COLOR,
    out: resolve(flag('--out')),
  }).catch((error) => {
    console.error(error.message.split('\n')[0]);
    process.exit(1);
  });
} else if (args[0] && !args[0].startsWith('--')) {
  const listPath = resolve(args[0]);
  await shoot(listPath, resolve(flag('--out') ?? join(dirname(listPath), 'media')), flag('--only')?.split(','));
} else {
  console.error(usage);
  process.exit(2);
}
