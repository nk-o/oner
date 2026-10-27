import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  renameSync,
  rmdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, sep } from 'node:path';
import { BuildError, TargetError } from './config.mjs';
import { hashInputs, renderFile, renderJson, tokenValues, walk } from './render.mjs';
import { PROVIDERS, TARGETS } from './targets.mjs';
import { adaptSkill, checkSkillFrontmatter } from './skills.mjs';
import { mergeReviewPolicy, reviewPolicy } from './review-policy.mjs';

const MANIFEST = '.agent-config-manifest.json';
// Gitignored, in the checkout, keyed by home directory: which dirs this checkout
// installed into for that user, and the input hash they were built from. --auto
// does nothing without an entry, so a worktree of this repository, or a run under
// another HOME, cannot overwrite what the main checkout installed.
const STATE = '.build-state.json';

// Builds every target in config and returns one report line per target that
// changed. With auto, nothing happens unless this checkout has built before and
// its inputs changed since.
export function build(repo, config, { auto }) {
  const statePath = join(repo, STATE);
  const allState = readJson(statePath) ?? {};
  const state = allState[homedir()];
  const hash = hashInputs(repo);
  if (auto && (!state || state.hash === hash)) return [];

  const ctx = { repo, roots: rootCommits(repo) };
  const lines = [];
  const next = { hash, targets: {} };
  for (const [name, spec] of Object.entries(TARGETS)) {
    const target = config.targets[name];
    const say = (line) => line && lines.push(`${name}: ${line}`);
    const prevDir = state?.targets?.[name];
    if (!target.enabled) {
      if (prevDir && prevDir !== target.dir) say(uninstallIfMine(ctx, spec, prevDir, 'disabled'));
      say(uninstallIfMine(ctx, spec, target.dir, 'disabled') ?? (auto ? null : `off (${target.dir})`));
      continue;
    }
    // Install at the new dir first, so a refusal there leaves the old install working.
    try {
      say(install(ctx, spec, target.dir, auto, config));
    } catch (err) {
      // An agent that is on only because its directory exists must not stop the
      // agents the user did turn on. Only a conflict in its own directory skips
      // it; a problem in the sources stops the build for every agent.
      if (!(err instanceof TargetError) || target.explicit || spec.alwaysOn) throw err;
      say(`skipped: ${err.message.replace(/\.?$/, '.')} Fix that and the next build installs it.`);
      if (prevDir) next.targets[name] = prevDir;
      continue;
    }
    if (prevDir && prevDir !== target.dir) say(uninstallIfMine(ctx, spec, prevDir, 'moved'));
    next.targets[name] = target.dir;
  }
  writeJson(statePath, { ...allState, [homedir()]: next });
  return lines;
}

function install(ctx, spec, dir, auto, config) {
  const manifestPath = join(dir, MANIFEST);
  const old = readJson(manifestPath);
  const takeover = old && old.source !== ctx.repo;
  if (takeover && existsSync(old.source)) {
    throw new TargetError(
      `${dir} was installed from ${old.source}. Build from there, or delete that checkout and build here again.`,
    );
  }

  const outputs = renderOutputs(ctx, spec, dir, config);
  const migrate = linksToMigrate(ctx, spec, dir);
  const settingsPath = spec.settings && join(dir, spec.settings.file);
  const settings = spec.settings ? readSettings(settingsPath) : null;
  const oldFiles = new Set(old?.files ?? []);
  const policyPath = spec.vendor === 'codex' ? join(dir, 'config.toml') : null;
  const policyBefore = policyPath && existsSync(policyPath) ? readFileSync(policyPath, 'utf8') : '';
  let policyAfter = policyBefore;
  if (policyPath) {
    try {
      policyAfter = mergeReviewPolicy(policyBefore, reviewPolicy(config.disabledSkills.includes('external-review') ? [] : enabledReviewers(config)));
    } catch (error) {
      throw new TargetError(`${policyPath}: ${error.message}`);
    }
  }

  const foreign = [...outputs.keys()].filter(
    (rel) => !migrate.includes(rel.split(sep)[0]) && !oldFiles.has(rel) && lexists(join(dir, rel)),
  );
  if (foreign.length) {
    throw new TargetError(
      `these already exist in ${dir} and this build did not write them:\n` +
        foreign.map((rel) => `  ${rel}`).join('\n') +
        '\nMove personal rules into local/AGENTS.md and personal skills into local/skills/, then build again.',
    );
  }
  const merged =
    spec.settings &&
    mergeSettings(
      settings.value,
      renderJson(
        JSON.parse(readFileSync(join(ctx.repo, spec.settings.template), 'utf8')),
        tokenValues(pathsFor(ctx, spec, dir, config), 'home', config),
      ),
      old?.settings,
      spec.legacy,
    );

  // Nothing is written above this line, so a refusal leaves the target as it was.
  mkdirSync(dir, { recursive: true });
  // The settings link is not unlinked: the write renames a real file over it, so
  // there is no moment without a settings file.
  for (const rel of migrate) if (rel !== spec.settings?.file) unlinkSync(join(dir, rel));
  const settingsChanged =
    !!spec.settings &&
    (migrate.includes(spec.settings.file) || !settings.exists || canon(merged.settings) !== canon(settings.value));
  if (settingsChanged) writeJson(settingsPath, merged.settings);
  const policyChanged = policyAfter !== policyBefore;
  if (policyChanged) writeIfChanged(policyPath, Buffer.from(policyAfter), 0o600);

  // Own the union first, so a run that dies midway finds its own half-written
  // files on the next run instead of refusing them as foreign.
  const newFiles = [...outputs.keys()].sort();
  const union = [...new Set([...oldFiles, ...newFiles])].sort();
  if (!old || takeover || canon(union) !== canon(old.files)) {
    writeJson(manifestPath, { version: 1, source: ctx.repo, files: union, settings: old?.settings ?? { keys: {}, hooks: [] } });
  }

  let written = 0;
  for (const [rel, { data, mode }] of outputs) {
    if (writeIfChanged(join(dir, rel), data, mode)) written += 1;
  }
  let removed = 0;
  for (const rel of oldFiles) {
    if (outputs.has(rel)) continue;
    if (removeOwned(dir, rel)) removed += 1;
  }
  writeJson(manifestPath, { version: 1, source: ctx.repo, files: newFiles, settings: merged?.owned ?? { keys: {}, hooks: [] } });

  const parts = [];
  if (takeover) parts.push(`took over from ${old.source}, which no longer exists`);
  if (migrate.length) parts.push(`replaced symlinks: ${migrate.join(', ')}`);
  if (written || removed) parts.push(`${written} written, ${removed} removed`);
  if (settingsChanged) parts.push(`${spec.settings.file} updated`);
  if (policyChanged) parts.push('config.toml external-review authorization updated');
  // Only a change to the hooks themselves needs approving again.
  if (spec.trustNote && merged && canon(merged.settings.hooks) !== canon(settings.value.hooks)) parts.push(spec.trustNote);
  return parts.length ? `${parts.join('; ')} (${dir})` : auto ? null : `up to date (${dir})`;
}

// Removes what the manifest in dir lists, when this checkout wrote it.
function uninstallIfMine(ctx, spec, dir, why) {
  const manifestPath = join(dir, MANIFEST);
  const old = readJson(manifestPath);
  if (!old) return null;
  if (old.source !== ctx.repo) return `${why}; ${dir} was installed from ${old.source}, left as it is`;
  let removed = 0;
  for (const rel of old.files) if (removeOwned(dir, rel)) removed += 1;
  const settingsPath = spec.settings && join(dir, spec.settings.file);
  const settings = spec.settings ? readSettings(settingsPath) : { exists: false };
  if (settings.exists) {
    const { settings: cleaned } = mergeSettings(settings.value, {}, old.settings, spec.legacy);
    if (canon(cleaned) !== canon(settings.value)) writeJson(settingsPath, cleaned);
  }
  if (spec.vendor === 'codex') {
    const policyPath = join(dir, 'config.toml');
    if (existsSync(policyPath)) {
      const before = readFileSync(policyPath, 'utf8');
      const after = mergeReviewPolicy(before, '');
      if (after !== before) writeIfChanged(policyPath, Buffer.from(after), 0o600);
    }
  }
  unlinkSync(manifestPath);
  return `${why}, ${removed} removed (${dir})`;
}

// The agent whose skills copy this target reads instead of one of its own, if any.
function skillsOwner(spec, config) {
  return spec.sharesSkillsWith && config.targets[spec.sharesSkillsWith].enabled ? spec.sharesSkillsWith : null;
}

function pathsFor(ctx, spec, dir, config) {
  const owner = skillsOwner(spec, config);
  return {
    skills_dir: owner ? join(config.targets[owner].dir, TARGETS[owner].skills) : join(dir, spec.skills),
    agents_dir: join(dir, spec.agents ? spec.agents.dir : 'agents'),
    repo_dir: ctx.repo,
    target_dir: dir,
  };
}

// Map of target-relative path to { data, mode }.
function renderOutputs(ctx, spec, dir, config) {
  const paths = pathsFor(ctx, spec, dir, config);
  const text = tokenValues(paths, 'tilde', config);
  const shell = tokenValues(paths, 'home', config);
  const render = (abs, rel) => renderFile(abs, rel.endsWith('.sh') ? shell : text);
  const out = new Map();

  const disabled = new Set(config.disabledSkills);
  const core = walk(join(ctx.repo, 'skills'));
  const local = walk(join(ctx.repo, 'local', 'skills'));
  const coreNames = new Set(core.map((f) => f.rel.split(sep)[0]));
  for (const f of local) {
    const skill = f.rel.split(sep)[0];
    if (coreNames.has(skill)) {
      throw new BuildError(`local/skills/${skill} has the same name as skills/${skill}. Rename the local one.`);
    }
  }
  const own = !skillsOwner(spec, config);
  for (const f of own ? [...core, ...local] : []) {
    if (disabled.has(f.rel.split(sep)[0]) && core.includes(f)) continue;
    let data = render(f.abs, f.rel);
    if (f.rel.split(sep).length === 2 && f.rel.endsWith('SKILL.md')) {
      checkSkillFrontmatter(data.toString('utf8'), f.rel);
    }
    if (core.includes(f) && f.rel.endsWith('SKILL.md')) {
      data = Buffer.from(adaptSkill(data.toString('utf8'), spec.vendor));
    }
    out.set(join(spec.skills, f.rel), { data, mode: f.mode });
  }
  if (out.has(join(spec.skills, 'external-review', 'SKILL.md'))) {
    out.set(join(spec.skills, 'external-review', 'providers.env'), {
      data: Buffer.from(providersEnv(config.reviewers, spec.vendor)),
      mode: 0o644,
    });
  }

  if (out.has(join(spec.skills, 'pr-wait', 'SKILL.md'))) {
    out.set(join(spec.skills, 'pr-wait', 'bots.json'), {
      data: Buffer.from(JSON.stringify(config.reviewBots, null, 2) + '\n'),
      mode: 0o644,
    });
  }

  for (const f of spec.agents ? walk(join(ctx.repo, 'agents')) : []) {
    const data = render(f.abs, f.rel);
    const { dir: agentsDir, format, ext, extra } = spec.agents;
    if (format === 'codex-toml') {
      const name = f.rel.replace(/\.md$/, '.toml');
      out.set(join(agentsDir, name), { data: Buffer.from(codexAgent(data.toString('utf8'), f.rel)), mode: 0o644 });
    } else if (format === 'md-plain') {
      const name = ext ? f.rel.replace(/\.md$/, ext) : f.rel;
      out.set(join(agentsDir, name), { data: Buffer.from(plainAgent(data.toString('utf8'), f.rel, extra)), mode: 0o644 });
    } else {
      out.set(join(agentsDir, f.rel), { data, mode: f.mode });
    }
  }

  let instructions = `These rules are installed for ${spec.label}. If read from another host, use the session's actual host and available tools.\n\n` +
    render(join(ctx.repo, 'AGENTS.md'), 'AGENTS.md').toString('utf8');
  const personal = join(ctx.repo, 'local', 'AGENTS.md');
  if (existsSync(personal)) instructions += '\n' + render(personal, 'AGENTS.md').toString('utf8');
  if (!config.disabledSkills.includes('external-review') && enabledReviewers(config).length) {
    instructions += '\n## Saved external review consent\n\n' + reviewPolicy(enabledReviewers(config)) + '\n';
  }
  out.set(spec.instructions, { data: Buffer.from(instructions), mode: 0o644 });
  return out;
}

function enabledReviewers(config) {
  return Object.keys(PROVIDERS).filter((p) => config.reviewers[p].enabled);
}

// Sourced by external-review's script. The agent the target serves is left out,
// because a voice from the vendor already running the session is no second opinion.
// The Claude Code copy is the exception: OpenCode and Grok read it too, so it
// keeps every voice and the script leaves Claude out when CLAUDECODE says so.
function providersEnv(reviewers, vendor) {
  const self = vendor === 'claude' ? null : vendor;
  const enabled = Object.keys(PROVIDERS).filter((p) => reviewers[p].enabled && p !== self);
  const lines = [
    '# Written by bin/build.mjs from config.json.',
    `ENABLED="${enabled.join(' ')}"`,
    ...(vendor === 'claude' ? ['CHECK_CLAUDECODE=1'] : []),
    `CURSOR_MODEL="${reviewers.cursor.model}"`,
    `CODEX_MODEL="${reviewers.codex.model}"`,
    `CODEX_EFFORT="${reviewers.codex.effort}"`,
    `CLAUDE_MODEL="${reviewers.claude.model}"`,
    `CLAUDE_EFFORT="${reviewers.claude.effort}"`,
  ];
  return lines.join('\n') + '\n';
}

// Splits a subagent file into its name, description, and body.
function parseAgent(text, rel) {
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text);
  if (!m) throw new BuildError(`agents/${rel} has no frontmatter`);
  const meta = {};
  for (const line of m[1].split('\n')) {
    const kv = /^([A-Za-z]+):\s*(.*)$/.exec(line);
    if (kv) meta[kv[1]] = kv[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  if (!meta.name || !meta.description) throw new BuildError(`agents/${rel} needs a name and a description`);
  return { meta, body: m[2].trim() + '\n' };
}

// Agents whose subagent frontmatter differs from Claude Code's get name and
// description only, plus the keys their format requires.
function plainAgent(text, rel, extra = {}) {
  const { meta, body } = parseAgent(text, rel);
  const lines = [`name: ${meta.name}`, `description: ${JSON.stringify(meta.description)}`];
  for (const [k, v] of Object.entries(extra)) lines.push(`${k}: ${v}`);
  return `---\n${lines.join('\n')}\n---\n\n${body}`;
}

// Codex reads subagents as TOML with name, description, and developer_instructions.
function codexAgent(text, rel) {
  const { meta, body } = parseAgent(text, rel);
  const instructions = body.includes("'''")
    ? `"""\n${body.replace(/\\/g, '\\\\').replace(/"""/g, '\\"\\"\\"')}"""`
    : `'''\n${body}'''`;
  return [
    `name = ${JSON.stringify(meta.name)}`,
    `description = ${JSON.stringify(meta.description)}`,
    ...(meta.effort ? [`model_reasoning_effort = ${JSON.stringify(meta.effort)}`] : []),
    `developer_instructions = ${instructions}`,
    '',
  ].join('\n');
}

// Symlinks left by the old wiring. Only a link into a checkout of this
// repository is taken over; anything else is someone's data and stops the build.
function linksToMigrate(ctx, spec, dir) {
  const migrate = [];
  for (const rel of spec.links) {
    const path = join(dir, rel);
    if (!lexists(path) || !lstatSync(path).isSymbolicLink()) continue;
    let real;
    try {
      real = realpathSync(path);
    } catch {
      throw new TargetError(
        `${path} is a symlink to ${readlinkSync(path)}, which does not exist. ` +
          'Put that file back, or replace the link with a copy of it, and build again.',
      );
    }
    const holder = statSync(real).isDirectory() ? real : dirname(real);
    if (!rootCommits(holder).some((c) => ctx.roots.includes(c))) {
      throw new TargetError(
        `${path} is a symlink into ${real}, which is not a checkout of this repository. ` +
          'Move what it holds into local/, remove the link, and build again.',
      );
    }
    migrate.push(rel);
  }
  return migrate;
}

// A hook entry is the build's when its event, matcher, and commands match one the
// build wrote, so an entry the user retimed is still replaced, not doubled, and
// the user's own entry for another matcher is left alone.
// Claude and Codex nest commands under `hooks`; Cursor puts one on the entry.
function hookId(event, entry) {
  const commands = !isObject(entry) ? [] : Array.isArray(entry.hooks) ? entry.hooks.map((h) => h?.command) : [entry.command];
  return JSON.stringify([event, entry?.matcher ?? null, commands.sort()]);
}

// Removes owned keys and hook entries recorded in oldOwned and the legacy hook
// commands, then adds the template's. Returns the new settings and what is owned.
export function mergeSettings(settings, template, oldOwned, legacyCommands) {
  const out = structuredClone(settings);
  if (out.hooks !== undefined && !isObject(out.hooks)) throw new TargetError('settings.json "hooks" is not an object');
  const ownedIds = new Set((oldOwned?.hooks ?? []).map((h) => hookId(h.event, h.entry)));
  const touched = new Set();

  for (const [event, list] of Object.entries(out.hooks ?? {})) {
    if (!Array.isArray(list)) throw new TargetError(`settings.json hooks.${event} is not a list`);
    const kept = [];
    for (const entry of list) {
      if (ownedIds.has(hookId(event, entry))) continue;
      const inner = isObject(entry) && Array.isArray(entry.hooks) ? entry.hooks : null;
      if (inner?.some((h) => legacyCommands.includes(h?.command))) {
        const rest = inner.filter((h) => !legacyCommands.includes(h?.command));
        if (rest.length) kept.push({ ...entry, hooks: rest });
        continue;
      }
      kept.push(entry);
    }
    if (kept.length !== list.length) touched.add(event);
    out.hooks[event] = kept;
  }
  for (const [key, value] of Object.entries(oldOwned?.keys ?? {})) {
    if (!(key in template) && canon(out[key]) === canon(value)) delete out[key];
  }

  const owned = { keys: {}, hooks: [] };
  for (const [key, value] of Object.entries(template)) {
    if (key === 'hooks') continue;
    out[key] = structuredClone(value);
    owned.keys[key] = value;
  }
  for (const [event, entries] of Object.entries(template.hooks ?? {})) {
    out.hooks ??= {};
    out.hooks[event] ??= [];
    for (const entry of entries) {
      const id = hookId(event, entry);
      if (!out.hooks[event].some((e) => hookId(event, e) === id)) out.hooks[event].push(structuredClone(entry));
      owned.hooks.push({ event, entry });
    }
  }

  for (const event of touched) if (out.hooks[event].length === 0) delete out.hooks[event];
  if (touched.size && isObject(out.hooks) && Object.keys(out.hooks).length === 0) delete out.hooks;
  return { settings: out, owned };
}

function readJson(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    throw new TargetError(`${path} is not valid JSON. Delete it and build again.`);
  }
}

// Read through a symlink on purpose: migration keeps what the old file held.
function readSettings(path) {
  if (!existsSync(path)) return { exists: false, value: {} };
  const text = readFileSync(path, 'utf8');
  if (!text.trim()) return { exists: true, value: {} };
  let value;
  try {
    value = JSON.parse(text);
  } catch (err) {
    throw new TargetError(`${path} is not valid JSON (${err.message}). Fix it and build again.`);
  }
  if (!isObject(value)) throw new TargetError(`${path} does not hold a JSON object.`);
  return { exists: true, value };
}

function writeIfChanged(path, data, mode) {
  if (lexists(path)) {
    const st = lstatSync(path);
    if (st.isFile() && (st.mode & 0o777) === mode && readFileSync(path).equals(data)) return false;
  }
  mkdirSync(dirname(path), { recursive: true });
  // Unique per run: the hooks can start two builds at once.
  const tmp = `${path}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
  writeFileSync(tmp, data);
  chmodSync(tmp, mode);
  renameSync(tmp, path);
  return true;
}

function writeJson(path, value) {
  writeIfChanged(path, Buffer.from(JSON.stringify(value, null, 2) + '\n'), 0o644);
}

// Tolerates a parallel build removing the same file or directory first.
function removeOwned(dir, rel) {
  const path = join(dir, rel);
  try {
    unlinkSync(path);
  } catch (err) {
    if (err.code === 'ENOENT') return false;
    throw err;
  }
  for (let d = dirname(path); d.startsWith(dir + sep); d = dirname(d)) {
    try {
      if (readdirSync(d).length) break;
      rmdirSync(d);
    } catch (err) {
      if (err.code === 'ENOENT') continue;
      if (err.code === 'ENOTEMPTY') break;
      throw err;
    }
  }
  return true;
}

function rootCommits(dir) {
  try {
    return execFileSync('git', ['-C', dir, 'rev-list', '--max-parents=0', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .split('\n')
      .filter(Boolean);
  } catch {
    return [];
  }
}

function lexists(path) {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

function isObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

// Key-order-independent JSON, for comparing settings.
function canon(value) {
  if (Array.isArray(value)) return `[${value.map(canon).join(',')}]`;
  if (isObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canon(value[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
}
