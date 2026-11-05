import { createReadStream, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import { repoLabel } from './repos.mjs';
import { run, SourceOff } from './run.mjs';
import { queryCodex } from './sources/codex.mjs';
import { localDate, searchTime } from './sources/github.mjs';

const WINDOW_DAYS = 30;
const HISTORY_DAYS = 400;
const CACHE_VERSION = 1;

export const windowStart = (now) => {
  const day = new Date(now);
  day.setHours(0, 0, 0, 0);
  day.setDate(day.getDate() - (WINDOW_DAYS - 1));
  return day.getTime();
};

export const historyStart = (now) => {
  const day = new Date(now);
  day.setHours(0, 0, 0, 0);
  day.setDate(day.getDate() - HISTORY_DAYS);
  return day.getTime();
};

const firstMatch = (re, line) => re.exec(line)?.[1] ?? null;

// What one transcript adds up to: numbers and labels, never its text.
export async function scanTranscript(file, { sub = false, signal } = {}) {
  const summary = { entry: null, repo: null, day: null, sub, turns: false, tokens: {} };
  const messages = new Map();
  const stream = createReadStream(file, { encoding: 'utf8' });
  const lines = createInterface({ input: stream, crlfDelay: Infinity });
  try {
    for await (const line of lines) {
      if (signal?.aborted) throw signal.reason;
      summary.entry ??= firstMatch(/"entrypoint":"([^"]+)"/, line);
      if (!summary.repo) {
        const cwd = firstMatch(/"cwd":"([^"]+)"/, line);
        if (cwd) summary.repo = repoLabel(cwd);
      }
      if (!summary.day) {
        const at = firstMatch(/"timestamp":"([^"]+)"/, line);
        if (at) summary.day = localDate(Date.parse(at));
      }
      if (!line.includes('"usage"') || !line.includes('"type":"assistant"')) continue;
      let parsed;
      try {
        parsed = JSON.parse(line);
      } catch {
        continue;
      }
      const message = parsed.message;
      if (parsed.type !== 'assistant' || !message?.usage || message.model === '<synthetic>') continue;
      // A streamed message repeats its usage on each line, and the last one is final.
      messages.set(message.id ?? parsed.uuid, { model: message.model, usage: message.usage, at: parsed.timestamp });
    }
  } finally {
    lines.close();
    stream.destroy();
  }
  for (const { model, usage, at } of messages.values()) {
    summary.turns = true;
    const day = (summary.tokens[localDate(Date.parse(at))] ??= {});
    const row = (day[model] ??= { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
    row.input += usage.input_tokens ?? 0;
    row.output += usage.output_tokens ?? 0;
    row.cacheRead += usage.cache_read_input_tokens ?? 0;
    row.cacheWrite += usage.cache_creation_input_tokens ?? 0;
  }
  return summary;
}

async function listTranscripts(projects, since) {
  const found = [];
  const add = async (path, sub) => {
    const info = await stat(path).catch(() => null);
    if (info && info.mtimeMs >= since) found.push({ path, sub, mtime: info.mtimeMs, size: info.size });
  };
  for (const project of await readdir(projects).catch(() => [])) {
    const dir = join(projects, project);
    for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
      if (entry.isFile() && entry.name.endsWith('.jsonl')) await add(join(dir, entry.name), false);
      else if (entry.isDirectory()) {
        const subagents = join(dir, entry.name, 'subagents');
        for (const name of await readdir(subagents).catch(() => [])) {
          if (name.endsWith('.jsonl')) await add(join(subagents, name), true);
        }
      }
    }
  }
  return found;
}

function loadCache(file) {
  try {
    const cache = JSON.parse(readFileSync(file, 'utf8'));
    if (cache.version === CACHE_VERSION && cache.files) return cache;
  } catch {}
  return { version: CACHE_VERSION, files: {} };
}

function saveCache(file, cache) {
  mkdirSync(dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync(temporary, JSON.stringify(cache), { mode: 0o600 });
  renameSync(temporary, file);
}

// External review runs through sdk-cli: another session's helpers, so they count neither
// as sessions nor as this person's tokens. A subagent's tokens count, not as a session.
// Everything stays per day, so the page can sum any range without asking again.
export function aggregate(summaries, since) {
  const first = localDate(since);
  const daily = {};
  const at = (day) => (daily[day] ??= { sessions: 0, models: {}, repos: {} });
  for (const s of summaries) {
    if (s.entry === 'sdk-cli') continue;
    if (!s.sub && s.turns && s.day >= first) at(s.day).sessions++;
    for (const [day, models] of Object.entries(s.tokens)) {
      if (day < first) continue;
      const entry = at(day);
      for (const [model, row] of Object.entries(models)) {
        const m = (entry.models[model] ??= { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
        for (const key of Object.keys(m)) m[key] += row[key];
        const repo = s.repo ?? 'other';
        entry.repos[repo] = (entry.repos[repo] ?? 0) + row.output;
      }
    }
  }
  return { daily };
}

export function claudeStatsSource({ claudeDir, cacheFile }) {
  return {
    id: 'stats-claude',
    label: 'Claude',
    interval: 10 * 60 * 1000,
    timeout: 20 * 60 * 1000,
    async read({ signal, now }) {
      const projects = join(claudeDir, 'projects');
      if (!existsSync(projects)) throw new SourceOff('no Claude Code transcripts on this machine');
      const since = historyStart(now);
      const cache = loadCache(cacheFile);
      const files = await listTranscripts(projects, since);
      const next = {};
      let read = 0;
      let unread = 0;
      let sinceSave = 0;
      for (const file of files) {
        const known = cache.files[file.path];
        if (known?.m === file.mtime && known.s === file.size) {
          next[file.path] = known;
          continue;
        }
        try {
          next[file.path] = { m: file.mtime, s: file.size, ...(await scanTranscript(file.path, { sub: file.sub, signal })) };
          read++;
          // A long first scan keeps what it has, so a restart resumes instead of starting over.
          if (++sinceSave >= 100) {
            sinceSave = 0;
            saveCache(cacheFile, { version: CACHE_VERSION, files: { ...cache.files, ...next } });
          }
        } catch (err) {
          if (signal.aborted) {
            saveCache(cacheFile, { version: CACHE_VERSION, files: { ...cache.files, ...next } });
            throw err;
          }
          unread++;
        }
      }
      saveCache(cacheFile, { version: CACHE_VERSION, files: next });
      return { data: { ...aggregate(Object.values(next), since), files: files.length, read }, unread };
    },
  };
}

export function codexStatsSource({ codexDir }) {
  return {
    id: 'stats-codex',
    label: 'Codex',
    interval: 10 * 60 * 1000,
    timeout: 30_000,
    async read({ signal, now }) {
      const since = Math.floor(historyStart(now) / 1000);
      const rows = await queryCodex(
        codexDir,
        `select date(created_at, 'unixepoch', 'localtime') as day, cwd, model, count(*) as threads, sum(tokens_used) as tokens
         from threads where source in ('vscode', 'cli') and created_at >= ${since} group by day, cwd, model`,
        signal,
      );
      const daily = {};
      for (const row of rows) {
        const entry = (daily[row.day] ??= { sessions: 0, tokens: 0, models: {}, repos: {} });
        entry.sessions += row.threads;
        entry.tokens += row.tokens;
        const model = row.model ?? 'unknown';
        entry.models[model] = (entry.models[model] ?? 0) + row.tokens;
        const repo = repoLabel(row.cwd) || 'other';
        entry.repos[repo] = (entry.repos[repo] ?? 0) + row.tokens;
      }
      return { data: { daily } };
    },
  };
}

const utcMonth = (ms) => new Date(ms).toISOString().slice(0, 7);

export function monthsBetween(fromMs, toMs) {
  const months = [];
  const end = utcMonth(toMs);
  for (let key = utcMonth(fromMs); key <= end; ) {
    months.push(key);
    const [y, m] = key.split('-').map(Number);
    key = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  }
  return months;
}

const monthBounds = (key) => {
  const [y, m] = key.split('-').map(Number);
  return [Date.UTC(y, m - 1, 1), Date.UTC(y, m, 1) - 1000];
};

// GitHub answers at most 1000 results per search, so history is read a month at a time.
// A month two days past its end no longer changes and stays in the cache. Only the months
// the chosen range needs are ever read.
export function prStatsSource({ cacheFile }) {
  let wanted = null;
  return {
    id: 'stats-prs',
    label: 'Merged pull requests',
    interval: 60 * 60 * 1000,
    timeout: 10 * 60 * 1000,
    want(fromMs) {
      if (wanted === null || fromMs < wanted) wanted = fromMs;
    },
    async read({ signal, now }) {
      const start = Math.min(wanted ?? Infinity, windowStart(now));
      const cache = loadCache(cacheFile);
      cache.months ??= {};
      let capped = 0;
      for (const key of monthsBetween(start, now)) {
        const [first, last] = monthBounds(key);
        if (cache.months[key]?.frozen) continue;
        const prs = [];
        let cursor = null;
        let total = 0;
        do {
          const range = `${searchTime(first)}..${searchTime(last)}`;
          const query = `query($cursor: String) { search(query: "is:pr is:merged author:@me merged:${range}", type: ISSUE, first: 100, after: $cursor) {
            issueCount pageInfo { hasNextPage endCursor } nodes { ... on PullRequest { mergedAt repository { nameWithOwner } } } } }`;
          const args = ['api', 'graphql', '-f', `query=${query}`];
          if (cursor) args.push('-f', `cursor=${cursor}`);
          const { data, errors } = JSON.parse(await run('gh', args, { signal }));
          if (errors?.length) throw new Error(errors[0].message);
          total = data.search.issueCount;
          prs.push(...data.search.nodes);
          cursor = data.search.pageInfo.hasNextPage ? data.search.pageInfo.endCursor : null;
        } while (cursor);
        if (prs.length < total) capped += total - prs.length;
        cache.months[key] = {
          frozen: now - last > 2 * 24 * 60 * 60 * 1000,
          prs: prs.map((pr) => [Date.parse(pr.mergedAt), pr.repository.nameWithOwner]),
        };
        saveCache(cacheFile, cache);
      }
      const daily = {};
      for (const { prs } of Object.values(cache.months)) {
        for (const [at, repo] of prs) {
          const entry = (daily[localDate(at)] ??= { merged: 0, repos: {} });
          entry.merged++;
          entry.repos[repo] = (entry.repos[repo] ?? 0) + 1;
        }
      }
      return {
        data: { daily, from: localDate(Math.min(start, ...Object.keys(cache.months).map((k) => monthBounds(k)[0]))) },
        note: capped ? `${capped} pull requests past the GitHub search limit are not counted` : null,
      };
    },
  };
}
