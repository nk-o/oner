import { SourceOff } from './run.mjs';

// Runs the panel's sources. A source is { id, label, interval, timeout, read(ctx) }.
// read resolves to { items, data, unread, note }, throws to report a failure, and
// throws SourceOff when its tool is not on this machine. Nothing here touches disk,
// so the last known items live only as long as the server.
export function createHub(sources, { clock = Date.now } = {}) {
  const slots = new Map(
    sources.map((source) => [
      source.id,
      { source, state: 'checking', reason: null, items: [], data: null, note: null, unread: 0, triedAt: null, okAt: null, running: null },
    ]),
  );

  function start(slot) {
    if (slot.running) return slot.running;
    const { source } = slot;
    const controller = new AbortController();
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`no answer in ${Math.round(source.timeout / 1000)} s`));
        controller.abort();
      }, source.timeout);
    });
    const finish = () => {
      clearTimeout(timer);
      slot.triedAt = clock();
      slot.running = null;
    };
    slot.running = Promise.race([Promise.resolve().then(() => source.read({ signal: controller.signal, now: clock() })), timeout]).then(
      (result) => {
        finish();
        slot.items = result.items ?? [];
        slot.data = result.data ?? null;
        slot.note = result.note ?? null;
        slot.unread = result.unread ?? 0;
        slot.state = slot.unread ? 'partial' : 'ok';
        slot.reason = null;
        slot.okAt = clock();
      },
      (err) => {
        finish();
        slot.state = err instanceof SourceOff ? 'off' : 'failed';
        slot.reason = String(err?.message ?? err);
        if (slot.state === 'off') {
          slot.items = [];
          slot.data = null;
        }
      },
    );
    return slot.running;
  }

  function view(slot) {
    const { source } = slot;
    const stale = slot.okAt !== null && slot.state !== 'off' && clock() - slot.okAt > source.interval * 2;
    return {
      id: source.id,
      label: source.label,
      state: slot.state,
      checking: slot.running !== null,
      stale,
      reason: slot.reason,
      note: slot.note,
      unread: slot.unread,
      checkedAt: slot.okAt,
      items: slot.items,
      data: slot.data,
    };
  }

  return {
    // Answers at once with what is known, and starts the reads that are due. A read
    // already running is joined, so any number of callers cause one request per source.
    snapshot(ids, { force = false } = {}) {
      return ids.map((id) => {
        const slot = slots.get(id);
        const due = slot.triedAt === null || clock() - slot.triedAt >= slot.source.interval;
        if (force || due) start(slot);
        return view(slot);
      });
    },
    settled(ids) {
      return Promise.all(ids.map((id) => slots.get(id).running));
    },
  };
}
