// One entry per agent the build can write into. Adding an agent is a row here,
// not a branch in the installer.
//   instructions  where AGENTS.md goes
//   skills        where skills/ goes
//   sharesSkillsWith  an agent whose skills this one already reads; while that
//                 agent is on, this one gets no copy of its own, or every skill
//                 would be listed twice
//   agents        where agents/*.md go, and in which format (see build/install.mjs), or false
//   settings      the JSON file the build merges its own hooks and keys into, and its template
//   links         paths an older checkout symlinked into the repo, taken over on migration
//   legacy        hook commands the old wiring registered, dropped on migration
//   vendor        the external-review provider this agent already is
//   trustNote     said whenever the build changes the hooks, when the agent must approve them
export const TARGETS = {
  claude: {
    label: 'Claude Code',
    cli: 'claude',
    defaultDir: '~/.claude',
    alwaysOn: true,
    instructions: 'CLAUDE.md',
    skills: 'skills',
    agents: { dir: 'agents', format: 'md' },
    settings: { file: 'settings.json', template: 'targets/claude/settings.json' },
    links: ['skills', 'agents', 'CLAUDE.md', 'settings.json'],
    legacy: ['"$HOME/.agents/skills/oneshot/hook.sh"'],
    vendor: 'claude',
  },
  codex: {
    label: 'Codex',
    cli: 'codex',
    defaultDir: '~/.codex',
    instructions: 'AGENTS.md',
    skills: 'skills',
    agents: { dir: 'agents', format: 'codex-toml' },
    settings: { file: 'hooks.json', template: 'targets/codex/hooks.json' },
    trustNote: 'In Codex, run /hooks once and trust the changed hooks; Codex skips a hook until then.',
    links: ['skills', 'AGENTS.md'],
    legacy: [],
    vendor: 'codex',
  },
  cursor: {
    label: 'Cursor',
    cli: 'agent',
    defaultDir: '~/.cursor',
    // The Cursor CLI reads neither ~/.cursor/AGENTS.md nor ~/.cursor/rules, so
    // the rules reach it through the sessionStart hook, which reads this copy.
    instructions: 'agent-config/AGENTS.md',
    skills: 'skills',
    agents: { dir: 'agents', format: 'md' },
    settings: { file: 'hooks.json', template: 'targets/cursor/hooks.json' },
    links: ['skills', 'AGENTS.md'],
    legacy: [],
    vendor: 'cursor',
  },
  gemini: {
    label: 'Gemini CLI',
    cli: 'gemini',
    defaultDir: '~/.gemini',
    instructions: 'GEMINI.md',
    skills: 'skills',
    agents: { dir: 'agents', format: 'md-plain' },
    settings: { file: 'settings.json', template: 'targets/gemini/settings.json' },
    links: [],
    legacy: [],
    vendor: 'gemini',
  },
  copilot: {
    label: 'GitHub Copilot CLI',
    cli: 'copilot',
    defaultDir: '~/.copilot',
    instructions: 'copilot-instructions.md',
    skills: 'skills',
    agents: { dir: 'agents', format: 'md-plain', ext: '.agent.md' },
    links: [],
    legacy: [],
    vendor: 'copilot',
  },
  opencode: {
    label: 'OpenCode',
    cli: 'opencode',
    defaultDir: '~/.config/opencode',
    instructions: 'AGENTS.md',
    skills: 'skills',
    sharesSkillsWith: 'claude',
    agents: { dir: 'agents', format: 'md-plain', extra: { mode: 'subagent' } },
    links: [],
    legacy: [],
    vendor: 'opencode',
  },
  grok: {
    label: 'Grok Build',
    cli: 'grok',
    defaultDir: '~/.grok',
    instructions: 'AGENTS.md',
    skills: 'skills',
    sharesSkillsWith: 'claude',
    agents: false,
    settings: { file: 'hooks/agent-config.json', template: 'targets/grok/hooks.json' },
    links: [],
    legacy: [],
    vendor: 'grok',
  },
};

// The levels Claude Code's --effort and `effort` frontmatter accept.
export const EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max'];

// external-review voices, their defaults, and the effort levels the settings page offers.
export const PROVIDERS = {
  cursor: { label: 'Cursor', cli: 'agent', defaults: { model: 'cursor-grok-4.6-low' } },
  codex: { label: 'Codex', cli: 'codex', defaults: { model: 'gpt-6.1-sol', effort: 'medium' }, efforts: ['low', 'medium', 'high'] },
  claude: { label: 'Claude', cli: 'claude', defaults: { model: 'opus', effort: 'high' }, efforts: EFFORT_LEVELS },
};

// Stages of a oneshot run that a subagent carries. The agent's frontmatter holds
// `effort: {{effort_<stage>}}`, which the build fills from config.json. Claude
// Code reads that key; Codex receives model_reasoning_effort from the same value.
export const EFFORT_STAGES = {
  build: { label: 'Build', agent: 'oneshot-worker', default: 'medium' },
  review: { label: 'Review', agent: 'oneshot-reviewer', default: 'xhigh' },
};
