// Builds a section on screen from its own parts, in place: run it in an `eval` step as
//   (<this file>)('<section selector>', [{ sel, from, at, step, ms }, ...], { scrim })
// Every group's elements start hidden and arrive in order. `from` is the entrance:
//   up, down, left, right (a slide with fade), pop (scale with overshoot), grow (scaleX from
//   the left, for bars), drop (scale from slightly large, for photos), words (each word rises).
// `at` is the group's start in ms, `step` the gap between its elements. Nothing is cloned, so
// the section keeps its own styles, hover states, and fonts.
(async (rootSel, groups, opts = {}) => {
  const root = document.querySelector(rootSel);
  if (!root) throw new Error(`assemble: no ${rootSel}`);
  const EASE = 'cubic-bezier(.2,.9,.15,1)';
  const POP = 'cubic-bezier(.34,1.56,.64,1)';
  const D = opts.distance ?? 48;
  const kinds = {
    up: [{ opacity: 0, transform: `translateY(${D}px)` }, { opacity: 1, transform: 'none' }],
    down: [{ opacity: 0, transform: `translateY(-${D}px)` }, { opacity: 1, transform: 'none' }],
    left: [{ opacity: 0, transform: `translateX(${D * 1.5}px)` }, { opacity: 1, transform: 'none' }],
    right: [{ opacity: 0, transform: `translateX(-${D * 1.5}px)` }, { opacity: 1, transform: 'none' }],
    pop: [{ opacity: 0, transform: 'scale(.4)' }, { opacity: 1, transform: 'none' }],
    grow: [{ transform: 'scaleX(0)', transformOrigin: 'left center' }, { transform: 'scaleX(1)', transformOrigin: 'left center' }],
    drop: [{ opacity: 0, transform: 'scale(1.08)', filter: 'blur(6px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }],
    fade: [{ opacity: 0 }, { opacity: 1 }],
  };
  const words = (el) => {
    // Wraps text words once, so each can rise on its own.
    if (el.dataset.pvWords) return [...el.querySelectorAll('.pv-w')];
    el.dataset.pvWords = '1';
    const walk = (node) => {
      for (const child of [...node.childNodes]) {
        if (child.nodeType === 3 && child.textContent.trim()) {
          const frag = document.createDocumentFragment();
          for (const part of child.textContent.split(/(\s+)/)) {
            if (!part.trim()) { frag.append(part); continue; }
            const w = document.createElement('span');
            w.className = 'pv-w';
            w.style.display = 'inline-block';
            w.textContent = part;
            frag.append(w);
          }
          child.replaceWith(frag);
        } else if (child.nodeType === 1) walk(child);
      }
    };
    walk(el);
    return [...el.querySelectorAll('.pv-w')];
  };
  // The page's own entrance animations would play on top of the build, or replay it after: stop
  // every CSS animation and transition inside the section while the build runs.
  const quiet = () => root.querySelectorAll('*').forEach((el) => el.getAnimations().forEach((a) => {
    if (a instanceof CSSAnimation || a instanceof CSSTransition) { try { a.cancel(); } catch (e) {} }
  }));
  quiet();
  const quietTimer = setInterval(quiet, 50);
  const runs = [];
  for (const g of groups) {
    const els = [...root.querySelectorAll(g.sel)].filter((e) => e.getClientRects().length);
    const targets = g.from === 'words' ? els.flatMap(words) : els;
    const frames = g.from === 'words' ? kinds.up.map((f) => ({ ...f, transform: f.transform.replace(`${D}px`, '0.6em') })) : kinds[g.from ?? 'up'];
    targets.forEach((el, i) => runs.push(el.animate(frames, {
      duration: g.ms ?? (g.from === 'pop' ? 650 : 800),
      delay: (g.at ?? 0) + i * (g.step ?? 70),
      easing: g.from === 'pop' ? POP : EASE,
      fill: 'backwards',
    })));
  }
  await Promise.all(runs.map((a) => a.finished.catch(() => {})));
  clearInterval(quietTimer);
  return runs.length;
})
