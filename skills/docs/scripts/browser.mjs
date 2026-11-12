// What shoot.mjs and record.mjs share: where Playwright and the saved sign-in sessions live.
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const SESSIONS = join(homedir(), '.cache', 'docs-skill');

export function loadPlaywright() {
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
export const sessionPath = (url) => join(SESSIONS, `${new URL(url).hostname}.json`);

// The session file `shoot.mjs --login` saved for a `session` key, a host or a URL. Null without
// the key; throws when the key names a host nobody signed in to.
export function savedSession(host) {
  if (!host) return null;
  const path = sessionPath(host.includes('://') ? host : `https://${host}`);
  if (!existsSync(path)) throw new Error(`no session for ${host}, run: node shoot.mjs --login <url>`);
  return path;
}
