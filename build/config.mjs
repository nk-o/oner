import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { EFFORT_LEVELS, EFFORT_STAGES, PROVIDERS, TARGETS } from './targets.mjs';

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

// Returns the config with every default filled in and every dir absolute:
// { language, disabledSkills, effort: { <stage>: <level> }, reviewers: { <provider>: { enabled, ... } },
//   targets: { <name>: { enabled, dir } } }
export function loadConfig(repoDir) {
  return validateConfig(readRawConfig(repoDir), repoDir);
}

// The same checks for a config that is not on disk yet, such as one the settings
// page is about to save.
export function validateConfig(raw, repoDir) {
  const at = (path, msg) => new BuildError(`config.json ${path}: ${msg}`);
  if (!isObject(raw)) throw at('', 'must be an object');
  onlyKeys(raw, ['$schema', 'language', 'skills', 'effort', 'externalReview', 'targets'], '', at);

  if (raw.language !== undefined && (typeof raw.language !== 'string' || !raw.language.trim())) {
    throw at('language', 'must be a language name, such as "English"');
  }

  const skills = objectAt(raw.skills, 'skills', at);
  onlyKeys(skills, ['disabled'], 'skills', at);
  const disabled = skills.disabled ?? [];
  if (!Array.isArray(disabled) || disabled.some((s) => typeof s !== 'string')) {
    throw at('skills.disabled', 'must be a list of skill names');
  }
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
    onlyKeys(r, ['enabled', ...Object.keys(spec.defaults)], path, at);
    boolAt(r.enabled, `${path}.enabled`, at);
    const out = { enabled: r.enabled ?? true };
    for (const [key, value] of Object.entries(spec.defaults)) {
      if (r[key] !== undefined && (typeof r[key] !== 'string' || !/^[A-Za-z0-9._:-]+$/.test(r[key]))) {
        throw at(`${path}.${key}`, 'must be a plain name such as "gpt-5.6-sol"');
      }
      out[key] = r[key] ?? value;
    }
    reviewers[name] = out;
  }

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

  return { language: raw.language?.trim() ?? 'English', disabledSkills: disabled, effort, reviewers, targets };
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
