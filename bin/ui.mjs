#!/usr/bin/env node
// The oner panel: today's work, stats, local skills, and settings. Serves ui/ on
// 127.0.0.1 and saves into config.json and local/, then builds. Local only: the server
// binds to loopback, checks the Host header against DNS rebinding, and a write must
// carry the token the page was served with, so another site open in the browser cannot post.
import { execFileSync, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, realpathSync, unlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertCheckoutLocation, BuildError, loadConfig, readRawConfig, validateConfig } from '../build/config.mjs';
import { build } from '../build/install.mjs';
import { status } from '../build/status.mjs';
import { PROVIDERS, TARGETS } from '../build/targets.mjs';
import { EditorError } from '../panel/editor.mjs';
import { createPanel } from '../panel/index.mjs';

const PORT_TRIES = 20;
const args = process.argv.slice(2);
const openBrowser = args.includes('--open');
const portArg = args.indexOf('--port');
const first = portArg >= 0 ? Number(args[portArg + 1]) : 4719;
const unknown = args.some((a, i) => a !== '--open' && a !== '--port' && (portArg < 0 || i !== portArg + 1));
if (!Number.isInteger(first) || first < 1 || first > 65535 || unknown) {
  console.error('Usage: node bin/ui.mjs [--port N] [--open]');
  process.exit(2);
}

const repo = realpathSync(join(dirname(fileURLToPath(import.meta.url)), '..'));
const token = randomBytes(16).toString('hex');
const page = () => readFileSync(join(repo, 'ui', 'index.html'), 'utf8').replace('__TOKEN__', token);
const SCRIPTS = new Set(['/panel.js', '/range.js']);
const script = (path) => readFileSync(join(repo, 'ui', path.slice(1)), 'utf8');

function revision() {
  try {
    return execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}
const startedAt = revision();

// Only the keys the page edits are taken from it; target dirs and anything else
// already in config.json stay as they are.
function merge(raw, body) {
  const next = { $schema: './config.schema.json', ...raw };
  if (typeof body.language === 'string') next.language = body.language;
  if (Array.isArray(body.disabledSkills)) next.skills = { ...raw.skills, disabled: body.disabledSkills };
  next.targets = { ...raw.targets };
  for (const name of Object.keys(TARGETS)) {
    const on = body.targets?.[name];
    if (typeof on === 'boolean') next.targets[name] = { ...raw.targets?.[name], enabled: on };
  }
  if (body.effort && typeof body.effort === 'object') next.effort = { ...raw.effort, ...body.effort };
  next.externalReview = { ...raw.externalReview };
  for (const name of Object.keys(PROVIDERS)) {
    const r = body.reviewers?.[name];
    if (r && typeof r === 'object') next.externalReview[name] = { ...raw.externalReview?.[name], ...r };
  }
  if (body.reviewBots && typeof body.reviewBots === 'object') next.reviewBots = { ...raw.reviewBots, ...body.reviewBots };
  for (const key of ['attribution', 'telemetry']) {
    if (typeof body[key] === 'boolean') next[key] = { ...raw[key], enabled: body[key] };
  }
  if (body.autoCompact === null) delete next.autoCompact;
  else if (body.autoCompact !== undefined) next.autoCompact = { tokens: body.autoCompact };
  return next;
}

function send(res, code, body, type = 'application/json') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(type === 'application/json' ? JSON.stringify(body) : body);
}

async function readBody(req, limit) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    chunks.push(chunk);
    size += chunk.length;
    if (size > limit) return null;
  }
  const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (!body || typeof body !== 'object') throw new SyntaxError('Expected a JSON object.');
  return body;
}

const rebuild = () => build(repo, loadConfig(repo), { auto: false });

function handler(port, panel) {
  const hosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
  return async (req, res) => {
    if (!hosts.has(req.headers.host)) return send(res, 403, { error: 'Unknown host.' });
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const path = url.pathname;
      if (req.method !== 'GET') {
        if (req.headers['x-token'] !== token) return send(res, 403, { error: 'Reload the page and try again.' });
        if (req.method !== 'POST') return send(res, 405, { error: 'Not allowed.' });
      }
      if (req.method === 'GET') {
        if (path === '/') return send(res, 200, page(), 'text/html; charset=utf-8');
        if (SCRIPTS.has(path)) return send(res, 200, script(path), 'text/javascript; charset=utf-8');
        if (path === '/api/panel') return send(res, 200, { app: 'oner-panel', repo, pid: process.pid, revision: startedAt });
        if (path === '/api/state') return send(res, 200, status(repo));
        if (path === '/api/today') return send(res, 200, panel.today({ check: url.searchParams.get('check') }));
        if (path === '/api/machine') return send(res, 200, panel.machine());
        if (path === '/api/stats') return send(res, 200, panel.stats({ check: url.searchParams.get('check'), from: url.searchParams.get('from') }));
        if (path === '/api/local') return send(res, 200, panel.editor.list());
        if (path === '/api/local/file') return send(res, 200, panel.editor.read(url.searchParams.get('path')));
        if (path === '/api/local/versions') return send(res, 200, panel.editor.versions(url.searchParams.get('path')));
        if (path === '/api/local/version') return send(res, 200, panel.editor.version(url.searchParams.get('path'), url.searchParams.get('id')));
        return send(res, 404, { error: 'Not found.' });
      }
      const action = /^\/api\/local\/(save|create|delete|restore)$/.exec(path)?.[1];
      if (action) {
        const body = await readBody(req, 2 * 1024 * 1024);
        if (!body) return send(res, 413, { error: 'Too large.' });
        return send(res, 200, panel.editor[action](body));
      }
      if (path === '/api/config') {
        const body = await readBody(req, 100000);
        if (!body) return send(res, 413, { error: 'Too large.' });
        const next = merge(readRawConfig(repo), body);
        const config = validateConfig(next, repo);
        // The old file comes back when the build refuses, so a failed save leaves
        // nothing behind for the hooks to trip over.
        const file = join(repo, 'config.json');
        const before = existsSync(file) ? readFileSync(file) : null;
        writeFileSync(file, JSON.stringify(next, null, 2) + '\n');
        try {
          const lines = build(repo, config, { auto: false });
          return send(res, 200, { lines, state: status(repo) });
        } catch (err) {
          if (before) writeFileSync(file, before);
          else unlinkSync(file);
          // Agents built before the refusal got the new settings; build them
          // back from the restored file so they match what the page shows.
          try {
            build(repo, validateConfig(readRawConfig(repo), repo), { auto: false });
          } catch {}
          throw err;
        }
      }
      return send(res, 404, { error: 'Not found.' });
    } catch (err) {
      if (err instanceof EditorError) return send(res, err.status, { error: err.message, ...err.extra });
      if (err instanceof BuildError || err instanceof SyntaxError) return send(res, 400, { error: err.message });
      return send(res, 500, { error: String(err?.message ?? err) });
    }
  };
}

// The panel of this checkout on a port, or null. Another checkout's panel, or any other
// program, is not ours to reuse.
async function ours(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/panel`, { signal: AbortSignal.timeout(3000) });
    const body = await res.json();
    return body.app === 'oner-panel' && body.repo === repo ? { ...body, port } : null;
  } catch {
    return null;
  }
}

const scan = async () => (await Promise.all(Array.from({ length: PORT_TRIES + 1 }, (_, i) => ours(first + i)))).find(Boolean) ?? null;

// A server keeps the code it started with, so one left from before an update of this
// checkout stops here instead of serving old modules behind the new page.
async function findRunning() {
  const running = await scan();
  if (!running || running.revision === revision()) return running?.port ?? null;
  try {
    process.kill(running.pid);
  } catch (err) {
    if (err.code !== 'ESRCH') throw err;
  }
  for (let i = 0; i < 50 && (await ours(running.port)); i++) await new Promise((resolve) => setTimeout(resolve, 100));
  return null;
}

function announce(port) {
  console.log(`Panel: http://127.0.0.1:${port}/`);
  console.log(`Settings: http://127.0.0.1:${port}/?view=settings`);
}

function listen(port, tries, panel) {
  const server = createServer(handler(port, panel));
  server.once('error', async (err) => {
    // Two starts at once: the one that lost the port leaves the winner to serve.
    if (err.code === 'EADDRINUSE' && (await ours(port))) {
      announce(port);
      process.exit(0);
    }
    if (err.code === 'EADDRINUSE' && tries > 0) return listen(port + 1, tries - 1, panel);
    console.error(`ui: ${err.message}`);
    process.exit(1);
  });
  server.listen(port, '127.0.0.1', () => announce(port));
}

// The browser may stay in the foreground, so this waits only for the command to start.
function open(port) {
  const url = `http://127.0.0.1:${port}/`;
  const command = process.platform === 'darwin' ? 'open' : 'xdg-open';
  return new Promise((resolve) => {
    const child = spawn(command, [url], { detached: true, stdio: 'ignore' });
    child.once('error', () => {
      console.error(`ui: ${command} did not start. Open ${url} yourself.`);
      process.exit(1);
    });
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
}

// Finds this checkout's server or starts one that outlives this command, so the mod's
// button can return at once, and any number of presses leave one server.
async function openPanel() {
  let port = await findRunning();
  if (port === null) {
    const start = [fileURLToPath(import.meta.url), ...(portArg >= 0 ? ['--port', String(first)] : [])];
    spawn(process.execPath, start, { detached: true, stdio: 'ignore' }).unref();
    for (let i = 0; i < 80 && port === null; i++) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      port = await findRunning();
    }
    if (port === null) {
      console.error('ui: the panel did not start. Run node bin/ui.mjs to see why.');
      process.exit(1);
    }
  }
  await open(port);
  announce(port);
  process.exit(0);
}

try {
  assertCheckoutLocation(repo);
} catch (err) {
  console.error(`ui: ${err.message}`);
  process.exit(1);
}
if (openBrowser) {
  await openPanel();
} else {
  const running = await findRunning();
  if (running !== null) {
    announce(running);
    process.exit(0);
  }
  // A config.json with a mistake still serves the panel, so the settings can report it.
  let config = null;
  try {
    config = loadConfig(repo);
  } catch (err) {
    if (!(err instanceof BuildError)) throw err;
  }
  listen(first, PORT_TRIES, createPanel({
    repo,
    claudeDir: config?.targets.claude.dir ?? join(homedir(), '.claude'),
    codexDir: config?.targets.codex.dir ?? join(homedir(), '.codex'),
    rebuild,
  }));
}
