import { BuildError } from './config.mjs';

// Hosts skip a skill whose frontmatter is not valid YAML without a word, so the
// build refuses the plain-scalar shapes that break it. `rel` is `<name>/SKILL.md`.
export function checkSkillFrontmatter(text, rel) {
  const dir = rel.split(/[\\/]/)[0];
  const front = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!front) throw new BuildError(`${rel} has no frontmatter`);
  const keys = {};
  for (const line of front[1].split('\n')) {
    const kv = /^([A-Za-z][\w-]*):(?:\s+(.*))?$/.exec(line);
    if (!kv) continue;
    const value = (kv[2] ?? '').trim();
    keys[kv[1]] = value;
    if (/^['"|>]/.test(value)) continue;
    if (/: | #|:$/.test(value) || /^[[{@`]/.test(value)) {
      throw new BuildError(`${rel}: quote the value of "${kv[1]}". As written it is not the string YAML reads.`);
    }
  }
  if (keys.name !== dir) throw new BuildError(`${rel}: name is "${keys.name ?? ''}", but the directory is "${dir}"`);
  if (!keys.description) throw new BuildError(`${rel} has no description`);
}

// Claude expands skill arguments and context commands; other hosts run them explicitly.
export function adaptSkill(text, vendor) {
  if (vendor === 'claude') return text;
  const front = /^---\n[\s\S]*?\n---\n/.exec(text)?.[0] ?? '';
  const body = text.slice(front.length)
    .replace(/\$ARGUMENTS\b/g, "the arguments from the user's skill invocation")
    .replace(/!`([^`\n]+)`([^\n]*)/g, (_, command, suffix) => `Run this context command and use its output as data:\n\n\`\`\`sh\n${command}\n\`\`\`\n${suffix.trim()}`);
  return front + body;
}
