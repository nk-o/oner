const KIND_ORDER = { session: 0, pr: 1, ask: 2 };

// Merges what the sources know into the three groups. One item sits in one group:
// a pull request held by a running session shows on that session's row instead.
export function assemble(views) {
  const running = views.flatMap((v) => v.items).filter((item) => item.group === 'running');
  const held = new Map();
  for (const session of running) for (const url of session.prUrls ?? []) held.set(url, session);

  const groups = { waiting: [], running: [], finished: [] };
  for (const view of views) {
    // Items from a failed read are last known, so they say how old they are.
    const from = view.state === 'failed' ? view.checkedAt : null;
    for (const item of view.items) {
      if (item.kind === 'pr' && item.group === 'waiting' && held.has(item.url)) {
        const session = held.get(item.url);
        session.pr = { url: item.url, detail: item.detail };
        continue;
      }
      groups[item.group]?.push(from ? { ...item, from } : item);
    }
  }
  const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  groups.waiting.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.at - b.at || byId(a, b));
  groups.running.sort((a, b) => b.at - a.at || byId(a, b));
  groups.finished.sort((a, b) => b.at - a.at || byId(a, b));
  return groups;
}
