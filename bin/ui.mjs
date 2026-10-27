#!/usr/bin/env node
// The settings page. Serves ui/index.html on 127.0.0.1 and saves what it sends
// into config.json, then builds. Local only: the server binds to loopback,
// checks the Host header against DNS rebinding, and a save must carry the token
// the page was served with, so another site open in the browser cannot post.
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, realpathSync, unlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertCheckoutLocation, BuildError, readRawConfig, validateConfig } from '../build/config.mjs';
import { build } from '../build/install.mjs';
import { status } from '../build/status.mjs';
import { PROVIDERS, TARGETS } from '../build/targets.mjs';

const args = process.argv.slice(2);
const portArg = args.indexOf('--port');
const first = portArg >= 0 ? Number(args[portArg + 1]) : 4719;
if (!Number.isInteger(first) || first < 1 || first > 65535 || args.some((a, i) => a !== '--port' && (portArg < 0 || i !== portArg + 1))) {
  console.error('Usage: node bin/ui.mjs [--port N]');
  process.exit(2);
}

const repo = realpathSync(join(dirname(fileURLToPath(import.meta.url)), '..'));
const token = randomBytes(16).toString('hex');
const page = () => readFileSync(join(repo, 'ui', 'index.html'), 'utf8').replace('__TOKEN__', token);

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
  return next;
}

function send(res, code, body, type = 'application/json') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(type === 'application/json' ? JSON.stringify(body) : body);
}

function handler(port) {
  const hosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
  return async (req, res) => {
    if (!hosts.has(req.headers.host)) return send(res, 403, { error: 'Unknown host.' });
    try {
      if (req.method === 'GET' && req.url === '/') {
        return send(res, 200, page(), 'text/html; charset=utf-8');
      }
      if (req.method === 'GET' && req.url === '/api/state') {
        return send(res, 200, status(repo));
      }
      if (req.method === 'POST' && req.url === '/api/config') {
        if (req.headers['x-token'] !== token) return send(res, 403, { error: 'Reload the page and try again.' });
        let text = '';
        for await (const chunk of req) {
          text += chunk;
          if (text.length > 100000) return send(res, 413, { error: 'Too large.' });
        }
        const body = JSON.parse(text);
        if (!body || typeof body !== 'object') return send(res, 400, { error: 'Expected a JSON object.' });
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
      if (err instanceof BuildError || err instanceof SyntaxError) return send(res, 400, { error: err.message });
      return send(res, 500, { error: String(err?.message ?? err) });
    }
  };
}

function listen(port, tries) {
  const server = createServer(handler(port));
  server.once('error', (err) => {
    if (err.code === 'EADDRINUSE' && tries > 0) return listen(port + 1, tries - 1);
    console.error(`ui: ${err.message}`);
    process.exit(1);
  });
  server.listen(port, '127.0.0.1', () => console.log(`Settings: http://127.0.0.1:${port}/`));
}

try {
  assertCheckoutLocation(repo);
} catch (err) {
  console.error(`ui: ${err.message}`);
  process.exit(1);
}
listen(first, 20);
