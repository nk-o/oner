export type World = {
  steps: Record<string, () => void | Promise<void>>;
  checks: Record<string, () => boolean>;
  fingerprint: () => string;
  home?: () => boolean;
  teardown?: () => void;
};

export type Verdict =
  | { ok: true; states: number; paths: number }
  | { ok: false; path: string[]; broke: string };

export async function explore(make: () => World | Promise<World>, depth: number): Promise<Verdict> {
  const probe = await make();
  const names = Object.keys(probe.steps);
  const wantsHome = probe.home !== undefined;
  probe.teardown?.();
  const shortest = new Map<string, string[]>();
  const next = new Map<string, Set<string>>();
  const back = new Set<string>();
  const queue: { path: string[]; from?: string }[] = [{ path: [] }];
  let paths = 0;
  while (queue.length > 0) {
    const { path, from } = queue.shift() as { path: string[]; from?: string };
    paths++;
    const world = await make();
    try {
      try {
        for (const name of path) await world.steps[name]();
      } catch (error) {
        return { ok: false, path, broke: `threw: ${(error as Error).message}` };
      }
      for (const [name, holds] of Object.entries(world.checks)) {
        if (!holds()) return { ok: false, path, broke: name };
      }
      const key = world.fingerprint();
      if (from !== undefined) next.get(from)?.add(key);
      if (shortest.has(key)) continue;
      shortest.set(key, path);
      if (world.home?.()) back.add(key);
      if (path.length < depth) {
        next.set(key, new Set());
        for (const name of names) queue.push({ path: [...path, name], from: key });
      } else {
        back.add(key);
      }
    } finally {
      world.teardown?.();
    }
  }
  if (wantsHome) {
    for (let grew = true; grew; ) {
      grew = false;
      for (const [key, targets] of next) {
        if (!back.has(key) && [...targets].some((target) => back.has(target))) {
          back.add(key);
          grew = true;
        }
      }
    }
    for (const [key, path] of shortest) {
      if (!back.has(key)) return { ok: false, path, broke: `no step sequence leads home from ${key}` };
    }
  }
  return { ok: true, states: shortest.size, paths };
}
