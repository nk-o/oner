// The panel's views. `el`, `$`, `TOKEN`, and `load` come from the settings script in index.html.
import { addDays, bucketize, compact, dayList, mergeDays, normalize, parseRange, presetRange, PRESETS, rangeToQuery, sumDays } from '/range.js';

const VIEWS = ['today', 'machine', 'skills', 'settings'];
let view = null;
let timer = null;
let statsTimer = null;
let settingsLoaded = false;

const safeHref = (url) => {
  try {
    const u = new URL(url);
    if (u.protocol === 'https:' || u.protocol === 'claude:') return url;
    if (u.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname)) return url;
  } catch {}
  return null;
};

const clock = (ms) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
function age(ms, now) {
  const minutes = Math.max(0, Math.round((now - ms) / 60000));
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)}h`;
  return `${Math.round(minutes / 1440)}d`;
}
const bytes = (n) => {
  if (n == null) return 'measuring…';
  if (n < 1e9) return `${Math.round(n / 1e6)} MB`;
  return `${(n / 1e9).toFixed(n < 1e10 ? 1 : 0)} GB`;
};
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const link = (url, text, attrs = {}) => {
  const href = url && safeHref(url);
  return href ? el('a', { href, ...attrs }, text) : el('span', {}, text);
};
const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const dateLabel = (day, withYear = false) => new Date(`${day}T12:00:00`).toLocaleDateString('en', { month: 'short', day: 'numeric', ...(withYear ? { year: 'numeric' } : {}) });

// Rewrites a region only when its content changed, and keeps focus and open folds, so a
// background refresh never moves what the person is reading.
function patch(region, kids) {
  const next = el('div', {}, kids.flat().filter(Boolean));
  for (const open of region.querySelectorAll('details[open][data-open-key]')) {
    next.querySelector(`details[data-open-key="${CSS.escape(open.dataset.openKey)}"]`)?.setAttribute('open', '');
  }
  if (next.innerHTML === region.innerHTML) return;
  const key = document.activeElement?.dataset?.key;
  region.replaceChildren(...next.childNodes);
  if (key) region.querySelector(`[data-key="${CSS.escape(key)}"]`)?.focus();
}

// --- Today ---------------------------------------------------------------

const WAITING_SHOWN = 6;
let today = null;
let showAllWaiting = false;

function notChecked(source, check) {
  const since = source.checkedAt ? ` Last checked at ${clock(source.checkedAt)}.` : '';
  return el('div', { class: 'notice', role: 'alert' },
    el('span', {}, el('b', {}, `${source.label} not checked. `), `${source.reason}.${since}`),
    el('button', { type: 'button', class: 'btn', 'data-key': `check-${source.id}`, onclick: () => check(source.id) },
      source.checking ? 'Checking…' : 'Check again'));
}

function itemRow(item, now) {
  const clean = item.kind === 'pr' && item.detail === 'Ready to review or merge';
  const meta = [item.repo, clean ? null : item.detail].filter(Boolean).join(' · ');
  const label = item.kind === 'pr' ? 'PR' : item.kind === 'ask' ? 'Ask' : item.agent;
  return el('div', { class: `item${safeHref(item.url) ? ' link' : ''}` },
    el('div', { class: 'item-title', title: item.title }, link(item.url, item.title, { 'data-key': item.id })),
    el('div', { class: 'item-aside' }, `${label} · ${age(item.at, now)}`),
    meta ? el('div', { class: 'item-meta', title: meta }, meta) : null,
    item.from ? el('div', { class: 'item-from' }, `From ${clock(item.from)}, not checked since`) : null);
}

function liveRow(item, now) {
  const href = safeHref(item.url);
  return el(href ? 'a' : 'div', { class: `live-row${href ? ' link' : ''}`, ...(href ? { href, 'data-key': item.id } : {}) },
    el('i', { class: 'dot', 'aria-hidden': 'true' }),
    el('span', { class: 'name' }, item.title, el('span', { class: 'sub' }, [item.agent, item.repo].filter(Boolean).join(' · '))),
    el('span', { class: 'aside' }, age(item.at, now)));
}

function renderToday() {
  const data = today;
  if (!data) return;
  const { waiting, running, finished } = data.groups;
  const failed = data.sources.filter((s) => s.state === 'failed');
  const checking = data.sources.filter((s) => s.state === 'checking');
  const unknown = [...failed, ...checking];
  const n = waiting.length;
  const title = n ? `${plural(n, 'thing waits', 'things wait')} on you`
    : checking.length ? 'Checking your work…'
    : failed.length ? 'Nothing known yet'
    : 'Nothing waits on you';
  const summary = [
    running.length ? `${plural(running.length, 'agent')} running` : null,
    finished.length ? `${finished.length} finished today` : null,
  ].filter(Boolean).join(', ');
  const capped = !showAllWaiting && n > WAITING_SHOWN;
  const check = (id) => fetchToday(id).then(pollToday);
  const partial = data.sources.filter((s) => s.state === 'partial').map((s) => `${s.label}: ${plural(s.unread, 'record')} unread`);
  const notes = data.sources.filter((s) => s.note && s.id === 'github').map((s) => s.note);
  const stale = data.sources.filter((s) => s.stale).map((s) => `${s.label} is out of date`);
  const checkedAt = Math.min(...data.sources.map((s) => s.checkedAt).filter(Boolean));
  patch($('today'), [
    el('div', { class: 'lead' },
      el('h2', {}, title),
      summary ? el('p', {}, summary) : null),
    failed.map((s) => notChecked(s, check)),
    n ? el('div', { class: 'card' },
      (capped ? waiting.slice(0, WAITING_SHOWN) : waiting).map((item) => itemRow(item, data.now)),
      capped ? el('button', { type: 'button', class: 'more-row', 'data-key': 'more-waiting', onclick: () => { showAllWaiting = true; renderToday(); } }, `Show ${n - WAITING_SHOWN} more`) : null) : null,
    running.length ? el('section', { class: 'block', 'aria-labelledby': 'h-running' },
      el('h2', { id: 'h-running' }, 'Running'),
      el('div', { class: 'live' }, running.map((item) => liveRow(item, data.now)))) : null,
    finished.length ? el('details', { class: 'fold block', 'data-open-key': 'finished' },
      el('summary', { 'data-key': 'finished' }, `${finished.length} finished today`),
      el('div', { class: 'fold-body card' }, finished.map((item) => itemRow(item, data.now)))) : null,
    unknown.length && !n && !running.length ? null : el('p', { class: 'foot' },
      [Number.isFinite(checkedAt) ? `Updated ${clock(checkedAt)}` : null, ...partial, ...stale, ...notes].filter(Boolean).join(' · ')),
  ]);
}

let todayRequest = null;
function fetchToday(check) {
  if (todayRequest && !check) return todayRequest;
  const request = fetch(`/api/today${check ? `?check=${encodeURIComponent(check)}` : ''}`)
    .then((res) => res.json())
    .then((body) => {
      today = body;
      renderToday();
      return body;
    })
    .catch((err) => {
      $('today').replaceChildren(el('div', { class: 'lead' }, el('h2', {}, 'Panel server not answering')),
        el('div', { class: 'notice', role: 'alert' }, el('span', {}, `${err.message}. Start it with node bin/ui.mjs.`)));
      return null;
    })
    .finally(() => {
      if (todayRequest === request) todayRequest = null;
    });
  todayRequest = request;
  return request;
}

// The next read is scheduled only after this one answers, so a page left open never piles up requests.
async function pollToday() {
  clearTimeout(timer);
  if (view !== 'today') return;
  const body = await fetchToday();
  if (view !== 'today') return;
  const busy = body?.sources.some((s) => s.checking);
  clearTimeout(timer);
  timer = setTimeout(pollToday, busy ? 2000 : 15000);
}

// --- Activity ------------------------------------------------------------

const EARLIEST_DAYS = 400;
let stats = null;
let range = null;

const earliest = () => addDays(localToday(), -EARLIEST_DAYS);

// The address carries the range, so a reload or a shared tab keeps it.
function syncUrl() {
  const params = new URLSearchParams(location.search);
  for (const key of ['range', 'from', 'to', 'view']) params.delete(key);
  for (const [k, v] of new URLSearchParams(rangeToQuery(range))) params.set(k, v);
  const text = params.toString();
  history.replaceState(null, '', text ? `/?${text}` : '/');
}

function setRange(next) {
  range = next;
  syncUrl();
  renderControls();
  renderCharts();
  pollStats();
}

// The control lives outside the charts region, so a refresh never closes the picker.
function buildControls() {
  const seg = el('div', { class: 'seg', role: 'group', 'aria-label': 'Date range' },
    el('i', { class: 'seg-hi', id: 'seg-hi', 'aria-hidden': 'true' }),
    PRESETS.map((days) => el('button', { type: 'button', 'data-days': days, 'aria-pressed': 'false', onclick: (e) => { e.currentTarget.parentElement.classList.add('moves'); setRange(presetRange(days, localToday())); } },
      days === 365 ? '1Y' : `${days}D`)));
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icon.setAttribute('viewBox', '0 0 16 16');
  icon.setAttribute('fill', 'none');
  icon.setAttribute('stroke', 'currentColor');
  icon.setAttribute('aria-hidden', 'true');
  icon.innerHTML = '<rect x="2.5" y="3.5" width="11" height="10" rx="2"/><path d="M2.5 6.5h11M5.5 2v3M10.5 2v3"/>';
  const label = el('span', { id: 'date-label' });
  const button = el('button', { type: 'button', class: 'date-btn', id: 'date-btn', 'aria-expanded': 'false', 'aria-haspopup': 'dialog', onclick: () => togglePicker() }, icon, label);
  const pick = () => {
    const { value: a } = $('date-from');
    const { value: b } = $('date-to');
    if (a && b) setRange(normalize(a, b, localToday(), earliest()));
  };
  const pop = el('div', { class: 'date-pop', id: 'date-pop', role: 'dialog', 'aria-label': 'Choose dates', hidden: true,
    onkeydown: (e) => { if (e.key === 'Escape') { togglePicker(false); $('date-btn').focus(); } } },
    el('label', {}, 'From', el('input', { type: 'date', id: 'date-from', onchange: pick })),
    el('label', {}, 'To', el('input', { type: 'date', id: 'date-to', onchange: pick })));
  $('range-controls').replaceChildren(seg, button, pop);
  document.addEventListener('pointerdown', (e) => {
    if (!$('date-pop').hidden && !$('range-controls').contains(e.target)) togglePicker(false);
  });
}

function togglePicker(open = $('date-pop').hidden) {
  $('date-pop').hidden = !open;
  $('date-btn').setAttribute('aria-expanded', String(open));
  if (open) {
    renderControls();
    $('date-from').focus();
  }
}

function renderControls() {
  const today_ = localToday();
  for (const button of $('range-controls').querySelectorAll('[data-days]')) {
    const on = Number(button.dataset.days) === range.preset;
    button.setAttribute('aria-pressed', String(on));
    if (on) {
      const hi = $('seg-hi');
      hi.style.width = `${button.offsetWidth}px`;
      hi.style.transform = `translateX(${button.offsetLeft}px)`;
    }
  }
  $('seg-hi').style.opacity = range.preset ? '1' : '0';
  const sameYear = range.from.slice(0, 4) === range.to.slice(0, 4);
  $('date-label').textContent = range.from === range.to
    ? dateLabel(range.from, true)
    : `${dateLabel(range.from, !sameYear)} – ${dateLabel(range.to, !sameYear)}`;
  const [from, to] = [$('date-from'), $('date-to')];
  for (const input of [from, to]) {
    input.min = earliest();
    input.max = today_;
  }
  if (document.activeElement !== from) from.value = range.from;
  if (document.activeElement !== to) to.value = range.to;
}

function plot({ series, plan }) {
  const totals = plan.buckets.map((b) => series.reduce((sum, s) => sum + s.sum(b.days), 0));
  const max = Math.max(...totals, 0);
  if (!max) return el('div', { class: 'plot' }, el('div', { class: 'plot-empty' }, 'Nothing in this range'));
  const bucketLabel = (b) => {
    if (plan.unit === 'month') return new Date(`${b.key}-15T12:00:00`).toLocaleDateString('en', { month: 'long', year: 'numeric' });
    if (plan.unit === 'week') return `Week of ${dateLabel(b.days[0])}`;
    return dateLabel(b.days[0]);
  };
  return el('div', { class: 'plot' },
    el('div', { class: `bars-plot${plan.buckets.length > 45 ? ' dense' : ''}` },
      plan.buckets.map((b, i) => {
        const parts = series.map((s) => ({ s, value: s.sum(b.days) }));
        const text = series.length > 1
          ? `${bucketLabel(b)}: ${parts.map((p) => `${p.s.label} ${p.s.format(p.value)}`).join(', ')}`
          : `${bucketLabel(b)}: ${series[0].format(totals[i])}`;
        return el('div', { class: 'col', 'data-tip': text },
          parts.map((p) => (p.value ? el('div', { class: `seg-bar ${p.s.cls}`, style: `height:${(p.value / max) * 100}%` }) : null)));
      })),
    el('div', { class: 'axis-row' }, [range.from, range.to].map((day) => el('span', {}, dateLabel(day, range.from.slice(0, 4) !== range.to.slice(0, 4))))));
}

function chartState(sources) {
  const failed = sources.find((s) => s.state === 'failed');
  if (failed) {
    return el('div', { class: 'plot-state', role: 'alert' }, `${failed.label} not checked. ${failed.reason}.`,
      el('button', { type: 'button', class: 'btn', 'data-key': `check-${failed.id}`, onclick: () => fetchStats(failed.id).then(pollStats) }, failed.checking ? 'Checking…' : 'Check again'));
  }
  if (sources.every((s) => s.state === 'off')) return el('div', { class: 'plot-state' }, 'No history on this machine.');
  return el('div', { class: 'plot-state' }, 'Reading your history…');
}

function chartCard({ label, sources, value, unit, legend, series, plan }) {
  const ready = series.length > 0 && sources.every((s) => s.state === 'ok' || s.state === 'partial' || s.state === 'off' || s.data);
  const late = ready ? sources.find((s) => s.state === 'failed') : null;
  return el('div', { class: 'card chart-card' },
    el('div', { class: 'chart-label' }, label),
    late ? el('div', { class: 'chart-late', role: 'alert' }, `Not checked since ${clock(late.checkedAt)}. `,
      el('button', { type: 'button', class: 'plain', 'data-key': `check-${late.id}`, onclick: () => fetchStats(late.id).then(pollStats) }, 'Check again')) : null,
    ready ? el('div', { class: 'chart-value' }, value, unit ? el('span', { class: 'chart-unit' }, unit) : null) : null,
    ready && legend ? el('div', { class: 'legend' }, legend.map((l) => el('span', {}, el('i', { class: `swatch ${l.cls}` }), l.text))) : null,
    ready ? plot({ series, plan }) : chartState(sources));
}

function barList(entries, unit, cls) {
  const sorted = entries.filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, 8);
  const rest = sorted.slice(8).reduce((sum, [, v]) => sum + v, 0);
  if (rest) top.push(['Other', rest]);
  const max = Math.max(1, ...top.map(([, v]) => v));
  return el('div', { class: 'bars-list' }, top.map(([name, value]) =>
    el('div', { class: 'bar-row' },
      el('span', { class: 'wrap' }, name),
      el('span', { class: 'bar-track' }, el('span', { class: `bar-fill ${cls}`, style: `width:${(value / max) * 100}%` })),
      el('span', { class: 'num' }, unit(value)))));
}

// The cards keep their place while the first read runs, so the list below does not jump.
function renderChartsLoading() {
  $('charts').replaceChildren(el('div', { class: 'charts' },
    ['Sessions', 'Merged pull requests', 'Claude output tokens', 'Codex tokens'].map((label) =>
      el('div', { class: 'card chart-card' }, el('div', { class: 'chart-label' }, label), el('div', { class: 'plot-state' }, 'Reading your history…')))));
}

function renderCharts() {
  if (!stats || !range) return;
  const find = (id) => stats.sources.find((s) => s.id === id);
  const [claude, codex, prs] = [find('stats-claude'), find('stats-codex'), find('stats-prs')];
  const plan = bucketize(range.from, range.to);
  const days = dayList(range.from, range.to);
  const number = (n) => n.toLocaleString('en');
  const claudeOut = (d) => Object.values(d.models).reduce((sum, m) => sum + m.output, 0);
  const sessionSeries = [
    claude.data ? { label: 'Claude', cls: 's1', format: number, sum: (ds) => sumDays(claude.data.daily, ds, (d) => d.sessions) } : null,
    codex.data ? { label: 'Codex', cls: 's2', format: number, sum: (ds) => sumDays(codex.data.daily, ds, (d) => d.sessions) } : null,
  ].filter(Boolean);
  const sessionsTotal = sessionSeries.reduce((sum, s) => sum + s.sum(days), 0);
  const merged = (ds) => sumDays(prs.data?.daily, ds, (d) => d.merged);
  const output = (ds) => sumDays(claude.data?.daily, ds, claudeOut);
  const codexTokens = (ds) => sumDays(codex.data?.daily, ds, (d) => d.tokens);
  const prsLoading = prs.data && prs.data.from > range.from;
  const claudeModels = Object.entries(mergeDays(claude.data?.daily, days, 'models')).sort((a, b) => b[1].output - a[1].output);
  const detailSections = [
    prs.data ? ['Merged pull requests by repository', barList(Object.entries(mergeDays(prs.data.daily, days, 'repos')), String, 's0')] : null,
    claude.data ? ['Claude output tokens by project', barList(Object.entries(mergeDays(claude.data.daily, days, 'repos')), compact, 's1')] : null,
    codex.data ? ['Codex tokens by project', barList(Object.entries(mergeDays(codex.data.daily, days, 'repos')), compact, 's2')] : null,
    claudeModels.length ? ['Claude tokens by model', el('table', {},
      el('thead', {}, el('tr', {}, ['Model', 'Output', 'Input', 'Cache read', 'Cache write'].map((h, i) => el('th', { class: i ? 'num' : '' }, h)))),
      el('tbody', {}, claudeModels.map(([model, row]) => el('tr', {},
        el('td', { class: 'mono wrap' }, model),
        [row.output, row.input, row.cacheRead, row.cacheWrite].map((v) => el('td', { class: 'num' }, compact(v)))))))] : null,
    codex.data ? ['Codex tokens by model', barList(Object.entries(mergeDays(codex.data.daily, days, 'models')), compact, 's2')] : null,
    ['Every day', el('table', {},
      el('thead', {}, el('tr', {}, ['Day', 'Sessions', 'Merged', 'Claude output', 'Codex tokens'].map((h, i) => el('th', { class: i ? 'num' : '' }, h)))),
      el('tbody', {}, days.slice().reverse().map((day) => el('tr', {},
        el('td', {}, dateLabel(day, true)),
        [sessionSeries.reduce((sum, s) => sum + s.sum([day]), 0), merged([day])].map((v) => el('td', { class: 'num' }, number(v))),
        [output([day]), codexTokens([day])].map((v) => el('td', { class: 'num' }, compact(v)))))))],
  ].filter(Boolean);
  patch($('charts'), [
    el('div', { class: 'charts' },
      chartCard({
        label: 'Sessions',
        sources: [claude, codex],
        value: number(sessionsTotal),
        legend: sessionSeries.map((s) => ({ cls: s.cls, text: `${s.label} ${number(s.sum(days))}` })),
        series: sessionSeries,
        plan,
      }),
      chartCard({
        label: 'Merged pull requests',
        sources: [prs],
        value: prsLoading ? '…' : number(merged(days)),
        series: prs.data ? [{ label: 'Merged', cls: 's0', format: number, sum: merged }] : [],
        plan,
      }),
      claude.state === 'off' ? null : chartCard({
        label: 'Claude output tokens',
        sources: [claude],
        value: compact(output(days)),
        series: claude.data ? [{ label: 'Output', cls: 's1', format: compact, sum: output }] : [],
        plan,
      }),
      codex.state === 'off' ? null : chartCard({
        label: 'Codex tokens',
        sources: [codex],
        value: compact(codexTokens(days)),
        series: codex.data ? [{ label: 'Tokens', cls: 's2', format: compact, sum: codexTokens }] : [],
        plan,
      })),
    el('details', { class: 'fold block', 'data-open-key': 'details' },
      el('summary', { 'data-key': 'details' }, 'Details'),
      el('div', { class: 'fold-body card details-body' }, detailSections.map(([title, content]) => el('div', {}, el('h3', {}, title), content)))),
  ]);
}

async function fetchStats(check) {
  try {
    const query = new URLSearchParams({ ...(check ? { check } : {}), ...(range ? { from: range.from } : {}) });
    const res = await fetch(`/api/stats?${query}`);
    stats = await res.json();
    renderCharts();
    return stats;
  } catch (err) {
    $('charts').replaceChildren(el('div', { class: 'notice', role: 'alert' }, el('span', {}, `The panel server did not answer: ${err.message}.`)));
    return null;
  }
}

async function pollStats() {
  clearTimeout(statsTimer);
  if (view !== 'today') return;
  const body = await fetchStats();
  if (view !== 'today') return;
  clearTimeout(statsTimer);
  statsTimer = setTimeout(pollStats, body?.sources.some((s) => s.checking) ? 2000 : 60000);
}

// One shared tooltip follows the pointer, so the bars stay free of per-mark listeners.
$('charts').addEventListener('pointermove', (e) => {
  const tip = $('tip');
  const text = e.target.closest?.('[data-tip]')?.dataset.tip;
  tip.hidden = !text;
  if (!text) return;
  tip.textContent = text;
  const x = Math.min(e.clientX + 10, innerWidth - tip.offsetWidth - 8);
  const y = Math.min(e.clientY + 14, innerHeight - tip.offsetHeight - 8);
  tip.style.left = `${Math.max(8, x)}px`;
  tip.style.top = `${y}px`;
});
$('charts').addEventListener('pointerleave', () => { $('tip').hidden = true; });

// --- Machine -------------------------------------------------------------

let machine = null;
const openWorktrees = new Set();

function emptyMachine(source, text) {
  if (source.state === 'failed') return `${source.label} not checked. ${source.reason}.`;
  if (source.state === 'checking') return 'Checking…';
  if (source.state === 'off') return `${source.label} off. ${source.reason}.`;
  return text;
}

function worktreeRow(group) {
  const landed = group.trees.filter((t) => t.pr === 'MERGED' || t.pr === 'CLOSED');
  const measuring = group.trees.some((t) => t.bytes == null);
  const total = group.trees.reduce((sum, t) => sum + (t.bytes ?? 0), 0);
  return el('details', { class: 'tree-group', open: openWorktrees.has(group.id), ontoggle: (e) => { e.target.open ? openWorktrees.add(group.id) : openWorktrees.delete(group.id); } },
    el('summary', { 'data-key': group.id },
      el('span', { class: 'title' }, group.repo),
      el('span', { class: 'sub' }, `${plural(group.trees.length, 'worktree')}${landed.length ? `, ${landed.length} closed` : ''}`),
      el('span', { class: 'aside' }, measuring && !total ? bytes(null) : `${bytes(total)}${measuring ? '+' : ''}`)),
    landed.length ? el('p', { class: 'hint' }, 'To remove the closed ones, ask an agent to run ', el('code', {}, '/dev-tidy'), '.') : null,
    group.trees.slice().sort((a, b) => (b.bytes ?? 0) - (a.bytes ?? 0)).map((tree) =>
      el('div', { class: 'tree' },
        el('div', {},
          el('div', { class: 'mono wrap' }, tree.branch ?? 'detached'),
          el('div', { class: 'sub mono wrap' }, tree.path)),
        el('div', { class: 'aside' }, [tree.pr ? tree.pr.toLowerCase() : null, bytes(tree.bytes)].filter(Boolean).join(' · ')))));
}

function renderMachine() {
  if (!machine) return;
  const [trees, servers] = ['worktrees', 'servers'].map((id) => machine.sources.find((s) => s.id === id));
  const total = machine.worktrees.flatMap((g) => g.trees).reduce((sum, t) => sum + (t.bytes ?? 0), 0);
  patch($('machine'), [
    el('section', { class: 'machine-block', 'aria-labelledby': 'h-trees' },
      el('h2', { class: 'section-title', id: 'h-trees' }, total ? `Worktrees, ${bytes(total)}` : 'Worktrees'),
      el('div', { class: 'card' }, machine.worktrees.length ? machine.worktrees.map(worktreeRow) : el('div', { class: 'empty' }, emptyMachine(trees, 'No worktrees besides the main checkouts.')))),
    el('section', { class: 'machine-block', 'aria-labelledby': 'h-servers' },
      el('h2', { class: 'section-title', id: 'h-servers' }, 'Dev servers'),
      el('div', { class: 'card' }, machine.servers.length
        ? machine.servers.map((s) => el('div', { class: 'item link' },
            el('div', { class: 'item-title' }, link(s.url, `${s.repo} :${s.port}`, { 'data-key': s.id, target: '_blank', rel: 'noreferrer' })),
            el('div', { class: 'item-meta' }, [s.command, s.branch].filter(Boolean).join(' · '))))
        : el('div', { class: 'empty' }, emptyMachine(servers, 'No dev server is running.')))),
  ]);
}

async function pollMachine() {
  clearTimeout(timer);
  if (view !== 'machine') return;
  try {
    machine = await (await fetch('/api/machine')).json();
    renderMachine();
  } catch (err) {
    $('machine').replaceChildren(el('div', { class: 'notice', role: 'alert' }, el('span', {}, `The panel server did not answer: ${err.message}.`)));
  }
  if (view !== 'machine') return;
  clearTimeout(timer);
  timer = setTimeout(pollMachine, machine?.sources.some((s) => s.checking) ? 2000 : 15000);
}

// --- Local skills --------------------------------------------------------

const AGENTS = 'AGENTS.md';
let local = null;
let file = null;

const dirtyFile = () => file && file.text !== file.saved;

let token = TOKEN;

// A server restarted after an update has a new token. The page takes it from a fresh copy
// of itself, so an open editor keeps its text instead of asking for a reload.
async function api(path, body, retried = false) {
  const res = await fetch(`/api/local${path}`, body
    ? { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Token': token }, body: JSON.stringify(body) }
    : undefined);
  if (res.status === 403 && body && !retried) {
    const fresh = /const TOKEN = "([0-9a-f]+)"/.exec(await (await fetch('/')).text())?.[1];
    if (fresh && fresh !== token) {
      token = fresh;
      return api(path, body, true);
    }
  }
  const json = await res.json();
  if (!res.ok) throw Object.assign(new Error(json.error), json, { status: res.status });
  return json;
}
const query = (path) => `?path=${encodeURIComponent(path)}`;

const leave = () => !dirtyFile() || window.confirm(`Discard your changes to ${file.path}?`);

async function openFile(path, { create = false } = {}) {
  if (!leave()) return;
  const body = create ? { text: '', hash: null } : await api(`/file${query(path)}`);
  file = { path, text: body.text, saved: body.text, hash: body.hash, status: null, conflict: null, versions: [] };
  file.versions = create ? [] : await api(`/versions${query(path)}`);
  renderLocal();
  $('editor-text')?.focus();
}

async function refreshLocal() {
  local = await api('');
  renderLocal();
}

function renderEditor() {
  if (!file) return el('div', { class: 'card empty' }, local.skills.length ? 'Pick a file to edit.' : 'No local skills yet. Create one to start.');
  const save = async () => {
    // What is sent is what counts as saved. Text typed meanwhile stays unsaved, and a file
    // opened meanwhile keeps its own state.
    const saving = file;
    if (saving.saving) return;
    saving.saving = true;
    const text = saving.text;
    const button = $('editor-save');
    button.disabled = true;
    button.textContent = 'Saving…';
    saving.status = null;
    try {
      const out = await api('/save', { path: saving.path, text, baseHash: saving.hash });
      saving.hash = out.hash;
      saving.saved = text;
      saving.conflict = null;
      saving.status = { kind: 'ok', text: out.changed ? 'Saved and rebuilt. New sessions pick the change up.' : 'No changes to save.', lines: out.lines };
      saving.versions = await api(`/versions${query(saving.path)}`);
      local = await api('');
    } catch (err) {
      if (err.status === 409) saving.conflict = { disk: err.disk, hash: err.hash };
      else saving.status = { kind: 'error', text: `Not saved: ${err.message}` };
    }
    saving.saving = false;
    if (file !== saving) return;
    renderLocal();
    $('editor-text')?.focus();
  };
  const textarea = el('textarea', { id: 'editor-text', class: 'editor', spellcheck: 'false', 'aria-label': `Contents of ${file.path}`,
    oninput: (e) => { file.text = e.target.value; $('editor-save').disabled = file.saving || !dirtyFile(); },
    onkeydown: (e) => { if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); if (dirtyFile()) save(); } } });
  textarea.value = file.text;
  return el('div', { class: 'editor-pane' },
    el('div', { class: 'editor-head' },
      el('code', { class: 'wrap' }, `local/${file.path}`),
      el('button', { type: 'button', class: 'btn primary', id: 'editor-save', disabled: file.saving || !dirtyFile(), onclick: save }, file.saving ? 'Saving…' : 'Save and rebuild')),
    file.conflict ? el('div', { class: 'result error', role: 'alert' },
      el('strong', {}, 'This file changed on disk after you opened it.'),
      el('textarea', { class: 'editor small', readonly: true, 'aria-label': 'Version on disk' }, file.conflict.disk),
      el('div', { class: 'actions' },
        el('button', { type: 'button', onclick: () => { file.text = file.conflict.disk; file.saved = file.conflict.disk; file.hash = file.conflict.hash; file.conflict = null; renderLocal(); } }, 'Use the version on disk'),
        el('button', { type: 'button', onclick: () => { file.hash = file.conflict.hash; file.saved = file.conflict.disk; file.conflict = null; renderLocal(); } }, 'Keep my text'))) : null,
    textarea,
    file.status ? el('div', { class: `result${file.status.kind === 'error' ? ' error' : ''}`, role: file.status.kind === 'error' ? 'alert' : 'status' }, el('strong', {}, file.status.text),
      file.status.lines?.length ? el('pre', {}, file.status.lines.filter((l) => !/: off \(/.test(l)).join('\n')) : null) : null,
    file.versions.length ? el('details', { class: 'versions' },
      el('summary', {}, plural(file.versions.length, 'previous version')),
      file.versions.map((v) => el('div', { class: 'tree' },
        el('span', {}, new Date(v.at).toLocaleString()),
        el('button', { type: 'button', onclick: async () => {
          if (!leave()) return;
          const old = await api(`/version${query(file.path)}&id=${v.id}`);
          file.text = old.text;
          file.status = { kind: 'ok', text: 'Loaded an older version. Save to make it current.' };
          renderLocal();
        } }, 'Load')))) : null);
}

function renderLocal() {
  if (!local) return;
  const act = async (fn) => {
    try {
      await fn();
    } catch (err) {
      window.alert(err.message);
    }
  };
  $('local').replaceChildren(el('div', { class: 'local-grid' },
    el('nav', { class: 'card file-list', 'aria-label': 'Local files' },
      el('button', { type: 'button', class: `file${file?.path === AGENTS ? ' current' : ''}`, 'data-key': AGENTS, onclick: () => openFile(AGENTS) }, 'Your rules', el('span', { class: 'sub' }, local.agents ? 'local/AGENTS.md' : 'not created yet')),
      local.skills.map((skill) => el('div', { class: 'skill-block' },
        el('div', { class: 'skill-name' },
          el('span', { class: 'title wrap' }, skill.name),
          el('button', { type: 'button', class: 'plain', 'aria-label': `Add a file to ${skill.name}`, onclick: () => {
            const name = window.prompt(`New file in ${skill.name}`, 'reference.md');
            if (name) act(() => openFile(`skills/${skill.name}/${name}`, { create: true }));
          } }, 'Add file'),
          el('button', { type: 'button', class: 'plain danger', 'aria-label': `Delete ${skill.name}`, onclick: () => {
            if (!window.confirm(`Delete ${skill.name}? It stops reaching your agents, and you can restore it from this page.`)) return;
            act(async () => {
              await api('/delete', { name: skill.name });
              if (file?.path.startsWith(`skills/${skill.name}/`)) file = null;
              await refreshLocal();
            });
          } }, 'Delete')),
        skill.files.map((f) => f.editable
          ? el('button', { type: 'button', class: `file${file?.path === f.path ? ' current' : ''}`, 'data-key': f.path, onclick: () => act(() => openFile(f.path)) }, f.name)
          : el('div', { class: 'file off', title: 'Not a text file' }, f.name)))),
      el('form', { class: 'new-skill', onsubmit: (e) => {
        e.preventDefault();
        const form = e.target;
        act(async () => {
          if (!leave()) return;
          file = null;
          const out = await api('/create', { name: form.elements.name.value.trim(), description: form.elements.description.value });
          await refreshLocal();
          await openFile(out.path);
        });
      } },
        el('label', { for: 'new-name' }, 'New skill'),
        el('input', { type: 'text', id: 'new-name', name: 'name', placeholder: 'skill-name', required: true, autocomplete: 'off', spellcheck: 'false' }),
        el('input', { type: 'text', name: 'description', placeholder: 'What it does and when to use it', 'aria-label': 'Description', autocomplete: 'off' }),
        el('button', { type: 'submit' }, 'Create')),
      local.deleted.length ? el('div', { class: 'deleted' },
        el('div', { class: 'sub' }, 'Deleted'),
        local.deleted.map((d) => el('div', { class: 'skill-name' },
          el('span', { class: 'wrap' }, d.name),
          el('button', { type: 'button', class: 'plain', 'aria-label': `Restore ${d.name}`, onclick: () => act(async () => {
            await api('/restore', { id: d.id, name: d.name });
            await refreshLocal();
          }) }, 'Restore')))) : null),
    renderEditor()));
}

window.addEventListener('beforeunload', (e) => {
  if (dirtyFile()) e.preventDefault();
});

// --- Navigation ----------------------------------------------------------

function show(next) {
  view = next;
  clearTimeout(timer);
  clearTimeout(statsTimer);
  $('tip').hidden = true;
  document.body.dataset.view = next;
  for (const name of VIEWS) {
    $(`view-${name}`).hidden = name !== next;
    const tab = document.querySelector(`[data-tab][data-view-link="${name}"]`);
    if (name === next) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  }
  if (next === 'today') {
    syncUrl();
    renderControls();
    pollToday();
    pollStats();
  }
  if (next === 'machine') pollMachine();
  if (next === 'skills' && !local) refreshLocal().catch((err) => { $('local').replaceChildren(el('p', { class: 'loading', role: 'alert' }, err.message)); });
  if (next === 'settings' && !settingsLoaded) {
    settingsLoaded = true;
    load();
  }
}

const fromUrl = () => {
  const name = new URLSearchParams(location.search).get('view');
  return VIEWS.includes(name) ? name : 'today';
};

for (const a of document.querySelectorAll('[data-view-link]')) {
  a.addEventListener('click', (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
    e.preventDefault();
    history.pushState(null, '', a.getAttribute('href'));
    show(a.dataset.viewLink);
  });
}
window.addEventListener('popstate', () => {
  range = parseRange(location.search, localToday(), earliest());
  show(fromUrl());
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  if (view === 'today') {
    pollToday();
    pollStats();
  }
  if (view === 'machine') pollMachine();
});

range = parseRange(location.search, localToday(), earliest());
buildControls();
renderChartsLoading();
show(fromUrl());
document.fonts?.ready.then(() => { if (view === 'today') renderControls(); });
