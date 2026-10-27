#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const home = homedir();
const label = 'local.dev-tidy.ports';
const executable = join(dirname(fileURLToPath(import.meta.url)), 'dev-tidy');
const escape = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const path = [join(home, '.local/share/mise/shims'), join(home, '.local/bin'), '/opt/homebrew/bin', '/opt/homebrew/sbin', '/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin'].join(':');
const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${label}</string>
  <key>ProgramArguments</key><array>
    <string>${escape(executable)}</string>
    <string>--ports-only</string><string>--yes</string><string>--quiet</string>
  </array>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>${escape(path)}</string></dict>
  <key>StartInterval</key><integer>900</integer>
  <key>RunAtLoad</key><false/>
  <key>ProcessType</key><string>Background</string>
  <key>LowPriorityIO</key><true/>
  <key>StandardOutPath</key><string>${escape(join(home, 'Library/Logs/dev-tidy-ports.log'))}</string>
  <key>StandardErrorPath</key><string>${escape(join(home, 'Library/Logs/dev-tidy-ports.log'))}</string>
</dict></plist>
`;

if (process.argv.includes('--print')) {
  process.stdout.write(plist);
} else if (process.platform !== 'darwin' || process.argv.length !== 2) {
  console.error('Usage: node schedule-ports.mjs [--print]. Installation requires macOS.');
  process.exitCode = 1;
} else {
  const directory = join(home, 'Library/LaunchAgents');
  const file = join(directory, `${label}.plist`);
  mkdirSync(directory, { recursive: true });
  mkdirSync(join(home, 'Library/Logs'), { recursive: true });
  writeFileSync(file, plist);
  const domain = `gui/${process.getuid()}`;
  const existing = spawnSync('launchctl', ['print', `${domain}/${label}`], { stdio: 'ignore' });
  if (existing.status === 0) {
    const result = spawnSync('launchctl', ['bootout', `${domain}/${label}`], { stdio: 'inherit' });
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
  const result = spawnSync('launchctl', ['bootstrap', domain, file], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
  console.log(`${label}: port cleanup every 15 minutes; worktrees and branches stay on disk.`);
}
