#!/usr/bin/env node
// Cuts recorded shots into one video: camera moves, holds, and transitions. Format: ../references/edit.md.
//   node edit.mjs <edit.json> <out.mp4>
// Paths in the edit file resolve against its own folder. Needs ffmpeg on PATH.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const [editFile, outFile] = process.argv.slice(2);
if (!editFile || !outFile) {
  console.error('usage: node edit.mjs <edit.json> <out.mp4>');
  process.exit(2);
}
const base = dirname(resolve(editFile));
const edit = JSON.parse(readFileSync(editFile, 'utf8'));
const [OW, OH] = edit.size || [1920, 1080];
const FPS = edit.fps || 60;
const tmp = mkdtempSync(join(tmpdir(), 'pv-edit-'));
const ff = (args) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { stdio: ['ignore', 'inherit', 'inherit'] });
const probe = (f, entry) => execFileSync('ffprobe', ['-v', 'error', '-show_entries', entry, '-of', 'csv=p=0', f]).toString().trim();

const ease = {
  linear: (p) => p,
  inOut: (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2),
  out: (p) => 1 - Math.pow(1 - p, 3),
  in: (p) => p * p * p,
};

function focusPoint(f, marks, [sw, sh]) {
  if (Array.isArray(f)) return f;
  if (typeof f === 'string' && f.startsWith('mark:')) {
    const m = marks[f.slice(5)];
    if (!m) throw new Error(`no mark ${f}`);
    const [x, y, w, h] = m.box;
    return [x + w / 2, y + h / 2];
  }
  return [sw / 2, sh / 2];
}

// One crop window per frame. The window keeps the output aspect, never leaves the source, and
// moves between keyframes on the keyframe's curve.
function cameraCommands(camera, marks, src, frames) {
  const [sw, sh] = src;
  const keys = camera.map((k) => ({ at: k.at, zoom: k.zoom ?? 1, focus: focusPoint(k.focus, marks, src), ease: ease[k.ease || 'inOut'] }));
  const lines = [];
  for (let i = 0; i < frames; i++) {
    const t = i / FPS;
    let a = keys[0];
    let b = keys[keys.length - 1];
    for (let k = 0; k < keys.length - 1; k++) if (t >= keys[k].at && t <= keys[k + 1].at) { a = keys[k]; b = keys[k + 1]; break; }
    const p = t <= a.at ? 0 : t >= b.at ? 1 : b.ease((t - a.at) / (b.at - a.at || 1));
    const z = a.zoom + (b.zoom - a.zoom) * p;
    const fx = a.focus[0] + (b.focus[0] - a.focus[0]) * p;
    const fy = a.focus[1] + (b.focus[1] - a.focus[1]) * p;
    const w = sw / z;
    const h = (sw / z) * (OH / OW);
    const x = Math.min(Math.max(fx - w / 2, 0), sw - w);
    const y = Math.min(Math.max(fy - h / 2, 0), sh - h);
    lines.push(`${t.toFixed(4)} crop w ${w.toFixed(2)}, crop h ${h.toFixed(2)}, crop x ${x.toFixed(2)}, crop y ${y.toFixed(2)};`);
  }
  return lines.join('\n');
}

// Frames where nothing on screen changes, as [start, end) runs in seconds of the take. A run of
// identical frames can be shortened without a visible cut, because what is dropped is the same
// picture.
function stillRuns(src, from, to) {
  const out = execFileSync('ffmpeg', ['-loglevel', 'error', '-ss', String(from), '-to', String(to), '-i', src,
    '-vf', 'scale=320:-1,format=gray,tblend=all_mode=difference,signalstats,metadata=print:key=lavfi.signalstats.YMAX:file=-',
    '-f', 'null', '-'], { maxBuffer: 64 * 1024 * 1024 }).toString();
  const vals = [...out.matchAll(/YMAX=(\d+)/g)].map((m) => +m[1]);
  const runs = [];
  let start = null;
  vals.forEach((v, i) => {
    const t = from + (i + 1) / FPS;
    if (v < 24) { if (start === null) start = t; }
    else if (start !== null) { runs.push([start, t]); start = null; }
  });
  if (start !== null) runs.push([start, to]);
  return runs;
}

// Pass one: every segment becomes its own clip at the output size, frame rate, and length.
const clips = [];
for (const [i, seg] of edit.segments.entries()) {
  const src = resolve(base, seg.src);
  if (!existsSync(src)) throw new Error(`missing ${seg.src}`);
  const marksFile = `${src}.marks.json`;
  const marks = existsSync(marksFile) ? JSON.parse(readFileSync(marksFile, 'utf8')) : {};
  const [sw, sh] = probe(src, 'stream=width,height').split('\n')[0].split(',').map(Number);
  const from = seg.from ?? 0;
  const to = seg.to ?? Number(probe(src, 'format=duration'));
  const hold = seg.hold ?? 0;
  // Still stretches longer than `still` seconds are cut down to it, unless the segment opts out.
  const still = seg.still ?? edit.still ?? 0.45;
  const incoming = i > 0 ? edit.segments[i - 1].transition : null;
  const lead = incoming && incoming.type !== 'cut' ? incoming.dur ?? 0.5 : 0;
  let keep = [[from, to]];
  if (still !== false && !hold) {
    keep = [];
    let at = from;
    for (const [a, b] of stillRuns(src, from, to)) {
      // A still opening is kept as long as the cut into it takes, so motion starts after it lands.
      if (a <= from + 0.001) { at = Math.max(from, b - (lead + 0.15)); continue; }
      if (b >= to - 0.02) { keep.push([at, Math.min(to, a + (seg.settle ?? 0.3))]); at = null; break; } // a still ending: keep `settle` of it
      if (b - a > still) { keep.push([at, a + still]); at = b; } // a still middle: keep `still` of it
    }
    if (at !== null) keep.push([at, to]);
    keep = keep.filter(([x, y]) => y - x > 0.02);
    if (!keep.length) keep = [[from, Math.min(to, from + still)]];
  }
  const dur = keep.reduce((n, [a, b]) => n + b - a, 0) + hold;
  const frames = Math.round(dur * FPS);
  const out = join(tmp, `seg${i}.mp4`);
  const filters = keep.length === 1
    ? [`trim=${keep[0][0]}:${keep[0][1]}`, 'setpts=PTS-STARTPTS', `fps=${FPS}`]
    : [`select='${keep.map(([a, b]) => `between(t,${a.toFixed(3)},${b.toFixed(3)})`).join('+')}'`, `setpts=N/${FPS}/TB`, `fps=${FPS}`];
  if (hold) filters.push(`tpad=stop_mode=clone:stop_duration=${hold}`);
  // A held frame reads as a stall: unless the segment has its own camera or opts out, the
  // camera pushes in slowly across it so something always moves.
  const camera = seg.camera?.length ? seg.camera
    : seg.drift === false ? null
    : [{ at: 0, zoom: 1 }, { at: dur, zoom: 1 + (seg.drift ?? edit.drift ?? 0.035), ease: 'linear' }];
  if (camera) {
    const cmd = join(tmp, `seg${i}.cmd`);
    writeFileSync(cmd, cameraCommands(camera, marks, [sw, sh], frames));
    filters.push(`sendcmd=f='${cmd}'`, `crop=${sw}:${Math.round((sw * OH) / OW)}:0:0:exact=1`);
  } else if (Math.abs(sw / sh - OW / OH) > 0.01) {
    filters.push(`crop=${sw}:${Math.round((sw * OH) / OW)}:0:0`);
  }
  filters.push(`scale=${OW}:${OH}:flags=lanczos`, 'setsar=1', 'format=yuv420p');
  ff(['-i', src, '-vf', filters.join(','), '-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', '14', '-r', String(FPS), out]);
  clips.push({ file: out, dur, tr: seg.transition });
  if (keep.length > 1 || keep[0][1] < to - 0.05) console.log(`  ${seg.src}: ${(to - from).toFixed(1)}s -> ${(dur - hold).toFixed(1)}s after still frames`);
}

// Pass two: join them. A segment's transition describes the cut into the next one.
const inputs = clips.flatMap((c) => ['-i', c.file]);
// Every input gets one timebase, or xfade refuses the output of a concat.
const chains = clips.map((_, k) => `[${k}:v]fps=${FPS},settb=1/${FPS * 1000}[n${k}]`);
let prev = 'n0';
let run = clips[0].dur;
for (let k = 1; k < clips.length; k++) {
  const tr = clips[k - 1].tr || { type: 'cut' };
  const label = `x${k}`;
  if (tr.type === 'cut') {
    chains.push(`[${prev}][n${k}]concat=n=2:v=1:a=0,settb=1/${FPS * 1000}[${label}]`);
    run += clips[k].dur;
  } else {
    const d = tr.dur ?? 0.5;
    chains.push(`[${prev}][n${k}]xfade=transition=${tr.type}:duration=${d}:offset=${(run - d).toFixed(3)}[${label}]`);
    run += clips[k].dur - d;
  }
  prev = label;
}
const map = ['-filter_complex', chains.join(';'), '-map', `[${prev}]`];
ff([...inputs, ...map, '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-movflags', '+faststart', resolve(outFile)]);
rmSync(tmp, { recursive: true, force: true });
console.log(`${outFile} ${run.toFixed(1)}s, ${clips.length} segments`);
