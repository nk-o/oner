import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { listSkills, loadConfig, readRawConfig } from './config.mjs';
import { EFFORT_STAGES, PROVIDERS, TARGETS } from './targets.mjs';

const MANIFEST = '.agent-config-manifest.json';

// Everything a person or an agent needs to see before changing the setup:
// what is configured, what is installed where, which CLIs exist, which skills
// ship, and whether the checkout is behind its remote.
export function status(repo) {
  const config = loadConfig(repo);
  const raw = readRawConfig(repo);
  const onPath = (cli) => spawnSync('sh', ['-c', `command -v ${cli}`], { stdio: 'ignore' }).status === 0;

  const targets = Object.entries(TARGETS).map(([name, spec]) => {
    const { enabled, dir } = config.targets[name];
    let manifest = null;
    try {
      manifest = JSON.parse(readFileSync(join(dir, MANIFEST), 'utf8'));
    } catch {}
    return {
      name,
      label: spec.label,
      dir,
      enabled,
      explicit: raw.targets?.[name]?.enabled !== undefined,
      dirExists: existsSync(dir),
      cliFound: onPath(spec.cli),
      installedFrom: manifest?.source ?? null,
      files: manifest?.files?.length ?? 0,
    };
  });

  const reviewers = Object.entries(PROVIDERS).map(([name, spec]) => ({
    name,
    label: spec.label,
    cli: spec.cli,
    cliFound: onPath(spec.cli),
    efforts: spec.efforts,
    ...config.reviewers[name],
  }));

  const effort = Object.entries(EFFORT_STAGES).map(([stage, spec]) => ({
    stage,
    label: spec.label,
    agent: spec.agent,
    level: config.effort[stage],
  }));

  const disabled = new Set(config.disabledSkills);
  const skills = listSkills(repo).map((name) => ({
    name,
    description: skillDescription(join(repo, 'skills', name, 'SKILL.md')),
    disabled: disabled.has(name),
  }));

  return {
    repo,
    home: homedir(),
    configExists: existsSync(join(repo, 'config.json')),
    language: config.language,
    version: version(repo),
    targets,
    effort,
    reviewers,
    skills,
  };
}

function version(repo) {
  const git = (...args) => {
    try {
      return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch {
      return null;
    }
  };
  const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
  const upstream = git('rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}');
  return {
    commit: git('rev-parse', '--short', 'HEAD'),
    date: git('log', '-1', '--format=%cs'),
    branch,
    upstream,
    // Counted against the last fetch; the session-start check fetches daily.
    behind: upstream ? Number(git('rev-list', '--count', `HEAD..${upstream}`) ?? 0) : 0,
  };
}

// The description from SKILL.md frontmatter, folded block scalars included.
export function skillDescription(file) {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    return '';
  }
  const front = /^---\n([\s\S]*?)\n---/.exec(text)?.[1] ?? '';
  const lines = front.split('\n');
  const i = lines.findIndex((l) => /^description:/.test(l));
  if (i < 0) return '';
  const first = lines[i].replace(/^description:\s*/, '');
  if (!/^[>|][-+]?$/.test(first)) return first.replace(/^(['"])(.*)\1$/, '$2');
  const body = [];
  for (const line of lines.slice(i + 1)) {
    if (!/^\s+/.test(line)) break;
    body.push(line.trim());
  }
  return body.join(' ');
}
