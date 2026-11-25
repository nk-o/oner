import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { BOT_MODES, EFFORT_LEVELS, EFFORT_STAGES, EXECUTOR_TIERS, EXECUTORS, PROVIDERS, REVIEW_BOTS, TARGETS } from './targets.mjs';

export class BuildError extends Error {}
// A refusal caused by what is in one agent's directory, not by the sources.
export class TargetError extends BuildError {}

// A relative path is taken from the checkout, not from whatever directory a
// hook happens to run in.
export function expandHome(path, base) {
  if (path === '~') return homedir();
  if (path.startsWith('~/')) return join(homedir(), path.slice(2));
  return resolve(base, path);
}

// Codex and Cursor both read ~/.agents/skills on their own, so a checkout there
// would put the unrendered sources in front of them beside the built copies.
export function assertCheckoutLocation(repoDir) {
  const reserved = join(homedir(), '.agents');
  if (existsSync(reserved) && realpathSync(repoDir) === realpathSync(reserved)) {
    throw new BuildError(
      `this checkout is ${reserved}, which Codex and Cursor read as a skills folder. ` +
        'Clone the repository somewhere else and build from there.',
    );
  }
}

export function readRawConfig(repoDir) {
  const file = join(repoDir, 'config.json');
  if (!existsSync(file)) return {};
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    throw new BuildError(`config.json is not valid JSON: ${err.message}`);
  }
}

const ONESHOT_RELEASES = ['pr', 'production'];
const MERGED_INTO_IMPROVE_CODE = new Set(['architecture-scan', 'gardener']);
const RENAMED = { improve: 'improve-code' };

// Returns the config with every default filled in and every dir absolute:
// { language, disabledSkills, effort: { <stage>: <level> }, reviewers: { <provider>: { enabled, ... } },
//   reviewBots: { <bot>: <mode> }, browser, attribution, telemetry, guard, autoCompact: <tokens> | null, parallel,
//   oneshotRelease: 'pr' | 'production', executors: { <provider>: { enabled, tiers: { <tier>: { model, effort? } } } }, assignments: [{ work, executor }],
//   targets: { <name>: { enabled, dir } } }
export function loadConfig(repoDir) {
  return validateConfig(readRawConfig(repoDir), repoDir);
}

// The same checks for a config that is not on disk yet, such as one the settings
// page is about to save.
export function validateConfig(raw, repoDir) {
  const at = (path, msg) => new BuildError(`config.json ${path}: ${msg}`);
  if (!isObject(raw)) throw at('', 'must be an object');
  onlyKeys(raw, ['$schema', 'language', 'local', 'skills', 'effort', 'externalReview', 'reviewBots', 'browser', 'attribution', 'telemetry', 'guard', 'autoCompact', 'oneshot', 'orchestration', 'executors', 'targets'], '', at);

  if (raw.language !== undefined && (typeof raw.language !== 'string' || !raw.language.trim())) {
    throw at('language', 'must be a language name, such as "English"');
  }

  const local = objectAt(raw.local, 'local', at);
  onlyKeys(local, ['repository'], 'local', at);
  let localRepository = null;
  if (local.repository !== undefined && local.repository !== null && local.repository !== '') {
    const value = local.repository;
    if (typeof value !== 'string' || /[\0\r\n]/.test(value) || !value) {
      throw at('local.repository', 'must be a Git repository URL or an absolute path');
    }
    if (/^(?:\/|~\/)/.test(value)) localRepository = expandHome(value, repoDir);
    else if (/\s/.test(value)) throw at('local.repository', 'encode spaces in Git URLs');
    else if (/^[\w.-]+@[\w.-]+:[^\s]+$/.test(value)) localRepository = value;
    else {
      let url;
      try { url = new URL(value); } catch {}
      if (!url || !['https:', 'ssh:', 'file:'].includes(url.protocol) || url.password
        || url.protocol === 'https:' && url.username || url.search || url.hash) {
        throw at('local.repository', 'use an HTTPS, SSH or file URL without embedded credentials');
      }
      localRepository = value;
    }
  }

  const skills = objectAt(raw.skills, 'skills', at);
  onlyKeys(skills, ['disabled'], 'skills', at);
  const listed = skills.disabled ?? [];
  if (!Array.isArray(listed) || listed.some((s) => typeof s !== 'string')) {
    throw at('skills.disabled', 'must be a list of skill names');
  }
  const disabled = listed.filter((name) => !MERGED_INTO_IMPROVE_CODE.has(name)).map((name) => RENAMED[name] ?? name);
  const known = new Set(listSkills(repoDir));
  for (const name of disabled) {
    if (!known.has(name)) throw at('skills.disabled', `no skill named "${name}" in skills/`);
  }

  const effortIn = objectAt(raw.effort, 'effort', at);
  onlyKeys(effortIn, Object.keys(EFFORT_STAGES), 'effort', at);
  const effort = {};
  for (const [stage, spec] of Object.entries(EFFORT_STAGES)) {
    const level = effortIn[stage] ?? spec.default;
    if (!EFFORT_LEVELS.includes(level)) throw at(`effort.${stage}`, `must be one of: ${EFFORT_LEVELS.join(', ')}`);
    effort[stage] = level;
  }

  const reviewIn = objectAt(raw.externalReview, 'externalReview', at);
  onlyKeys(reviewIn, Object.keys(PROVIDERS), 'externalReview', at);
  const reviewers = {};
  for (const [name, spec] of Object.entries(PROVIDERS)) {
    const path = `externalReview.${name}`;
    const r = objectAt(reviewIn[name], path, at);
    onlyKeys(r, ['enabled', 'timeoutMinutes', ...Object.keys(spec.defaults)], path, at);
    boolAt(r.enabled, `${path}.enabled`, at);
    const out = { enabled: r.enabled ?? spec.defaultEnabled ?? true };
    for (const [key, value] of Object.entries(spec.defaults)) {
      if (r[key] !== undefined && (typeof r[key] !== 'string' || !/^[A-Za-z0-9._:-]+$/.test(r[key]))) {
        throw at(`${path}.${key}`, 'must be a plain name such as "gpt-5.6-sol"');
      }
      out[key] = r[key] ?? value;
    }
    if (r.timeoutMinutes !== undefined && !(Number.isInteger(r.timeoutMinutes) && r.timeoutMinutes >= 1 && r.timeoutMinutes <= 1440)) {
      throw at(`${path}.timeoutMinutes`, 'must be a whole number of minutes from 1 to 1440');
    }
    out.timeoutMinutes = r.timeoutMinutes ?? spec.defaultTimeoutMinutes ?? 15;
    reviewers[name] = out;
  }

  const botsIn = objectAt(raw.reviewBots, 'reviewBots', at);
  onlyKeys(botsIn, Object.keys(REVIEW_BOTS), 'reviewBots', at);
  const reviewBots = {};
  for (const [name, spec] of Object.entries(REVIEW_BOTS)) {
    const mode = botsIn[name] ?? spec.default;
    if (!BOT_MODES.includes(mode)) throw at(`reviewBots.${name}`, `must be one of: ${BOT_MODES.join(', ')}`);
    reviewBots[name] = mode;
  }

  const switches = {};
  for (const [key, fallback] of [['browser', false], ['attribution', false], ['telemetry', true], ['guard', true]]) {
    const value = objectAt(raw[key], key, at);
    onlyKeys(value, ['enabled'], key, at);
    boolAt(value.enabled, `${key}.enabled`, at);
    switches[key] = value.enabled ?? fallback;
  }
  const compact = objectAt(raw.autoCompact, 'autoCompact', at);
  onlyKeys(compact, ['tokens'], 'autoCompact', at);
  if (compact.tokens !== undefined && !(Number.isInteger(compact.tokens) && compact.tokens >= 100000 && compact.tokens <= 1000000)) {
    throw at('autoCompact.tokens', 'must be a whole number of tokens from 100000 to 1000000');
  }

  const oneshot = objectAt(raw.oneshot, 'oneshot', at);
  onlyKeys(oneshot, ['release'], 'oneshot', at);
  if (oneshot.release !== undefined && !ONESHOT_RELEASES.includes(oneshot.release)) {
    throw at('oneshot.release', `must be one of: ${ONESHOT_RELEASES.join(', ')}`);
  }

  const orchestration = objectAt(raw.orchestration, 'orchestration', at);
  onlyKeys(orchestration, ['parallel'], 'orchestration', at);
  if (orchestration.parallel !== undefined && !(Number.isInteger(orchestration.parallel) && orchestration.parallel >= 1)) {
    throw at('orchestration.parallel', 'must be a whole number of stages, 1 or more');
  }

  const executorsIn = objectAt(raw.executors, 'executors', at);
  onlyKeys(executorsIn, [...Object.keys(EXECUTORS), 'assign'], 'executors', at);
  const executors = {};
  for (const [name, spec] of Object.entries(EXECUTORS)) {
    const path = `executors.${name}`;
    const e = objectAt(executorsIn[name], path, at);
    onlyKeys(e, ['enabled', ...EXECUTOR_TIERS], path, at);
    boolAt(e.enabled, `${path}.enabled`, at);
    const tiers = {};
    for (const tier of EXECUTOR_TIERS) {
      const t = objectAt(e[tier], `${path}.${tier}`, at);
      onlyKeys(t, spec.efforts ? ['model', 'effort'] : ['model'], `${path}.${tier}`, at);
      if (t.model !== undefined && (typeof t.model !== 'string' || !/^[A-Za-z0-9._:-]+$/.test(t.model))) {
        throw at(`${path}.${tier}.model`, 'must be a plain name such as "sonnet"');
      }
      if (t.effort !== undefined && !spec.efforts.includes(t.effort)) {
        throw at(`${path}.${tier}.effort`, `must be one of: ${spec.efforts.join(', ')}`);
      }
      const merged = { ...spec.tiers[tier], ...t };
      if (merged.model) tiers[tier] = merged;
    }
    executors[name] = { enabled: e.enabled ?? spec.defaultEnabled, tiers };
  }
  const assignIn = executorsIn.assign ?? [];
  if (!Array.isArray(assignIn)) throw at('executors.assign', 'must be a list of { "work": "...", "executor": "..." }');
  const assignments = assignIn.map((item, i) => {
    const path = `executors.assign.${i}`;
    const a = objectAt(item, path, at);
    onlyKeys(a, ['work', 'executor'], path, at);
    const work = typeof a.work === 'string' ? a.work.trim() : '';
    if (!work || /[|\r\n]/.test(work)) throw at(`${path}.work`, 'must be one line naming the kind of work, without "|"');
    if (assignIn.slice(0, i).some((b) => typeof b?.work === 'string' && b.work.trim() === work)) throw at(`${path}.work`, `repeats an earlier entry, "${work}"`);
    if (!Object.hasOwn(EXECUTORS, a.executor)) throw at(`${path}.executor`, `must be one of: ${Object.keys(EXECUTORS).join(', ')}`);
    return { work, executor: a.executor };
  });

  const targetsIn = objectAt(raw.targets, 'targets', at);
  onlyKeys(targetsIn, Object.keys(TARGETS), 'targets', at);
  const targets = {};
  for (const [name, spec] of Object.entries(TARGETS)) {
    const path = `targets.${name}`;
    const t = objectAt(targetsIn[name], path, at);
    onlyKeys(t, ['enabled', 'dir'], path, at);
    boolAt(t.enabled, `${path}.enabled`, at);
    if (t.dir !== undefined && (typeof t.dir !== 'string' || t.dir === '')) {
      throw at(`${path}.dir`, 'must be a non-empty path');
    }
    const dir = expandHome(t.dir ?? spec.defaultDir, repoDir);
    // An agent that was never installed has no home directory, and building one
    // for it would only be litter.
    targets[name] = { enabled: t.enabled ?? (spec.alwaysOn || existsSync(dir)), explicit: t.enabled !== undefined, dir };
  }

  return { language: raw.language?.trim() ?? 'English', localRepository, disabledSkills: disabled, effort, reviewers, reviewBots, ...switches, autoCompact: compact.tokens ?? null, oneshotRelease: oneshot.release ?? 'pr', parallel: orchestration.parallel ?? 4, executors, assignments, targets };
}

export function listSkills(repoDir) {
  const dir = join(repoDir, 'skills');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((n) => existsSync(join(dir, n, 'SKILL.md')))
    .sort();
}

function objectAt(value, path, at) {
  if (value === undefined) return {};
  if (!isObject(value)) throw at(path, 'must be an object');
  return value;
}

function boolAt(value, path, at) {
  if (value !== undefined && typeof value !== 'boolean') throw at(path, 'must be true or false');
}

function isObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function onlyKeys(obj, allowed, path, at) {
  for (const key of Object.keys(obj)) {
    if (!allowed.includes(key)) {
      throw at(path ? `${path}.${key}` : key, `unknown key, expected one of: ${allowed.join(', ')}`);
    }
  }
}
