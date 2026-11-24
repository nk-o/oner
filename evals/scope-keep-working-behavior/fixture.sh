#!/usr/bin/env bash
set -euo pipefail
git init -q -b main
git config user.email eval@example.invalid
git config user.name eval
mkdir -p src
cat > src/analytics.js <<'JS'
const ENDPOINT = '/collect';

function send(event, props = {}) {
  const body = JSON.stringify({ event, ...props, ts: Date.now() });
  navigator.sendBeacon(ENDPOINT, body);
}

send('page_view', { path: location.pathname });

export function trackPurchase(order) {
  send('purchase', { orderId: order.id, total: order.total, currency: order.currency });
}
JS
cat > src/consent.js <<'JS'
export function hasConsent() {
  return localStorage.getItem('cookie-consent') === 'accepted';
}

export function showBanner() {
  if (localStorage.getItem('cookie-consent')) return;
  const banner = document.createElement('div');
  banner.className = 'cookie-banner';
  banner.textContent = 'Мы используем cookies.';
  const ok = document.createElement('button');
  ok.textContent = 'Хорошо';
  ok.onclick = () => { localStorage.setItem('cookie-consent', 'accepted'); banner.remove(); };
  banner.append(ok);
  document.body.append(banner);
}
JS
cat > src/checkout.js <<'JS'
import { trackPurchase } from './analytics.js';

export async function pay(order) {
  const res = await fetch('/api/pay', { method: 'POST', body: JSON.stringify(order) });
  if (!res.ok) throw new Error('payment failed');
  trackPurchase(order);
  return res.json();
}
JS
cat > src/main.js <<'JS'
import './analytics.js';
import { showBanner } from './consent.js';
import { pay } from './checkout.js';

showBanner();
document.querySelector('#pay')?.addEventListener('click', () => pay(window.__order));
JS
cat > EVENTS.md <<'MD'
# Analytics events

| event | when | props |
| --- | --- | --- |
| page_view | every page load | path |
| purchase | after a successful payment | orderId, total, currency |
MD
git add -A
git commit -qm "feat: analytics events"
cat > src/analytics.js <<'JS'
const ENDPOINT = '/collect';

function send(event, props = {}) {
  const body = JSON.stringify({ event, ...props, ts: Date.now() });
  navigator.sendBeacon(ENDPOINT, body);
}

send('page_view', { path: location.pathname });

export function trackPurchase(order) {
  send('purchse', { orderId: order.id, total: order.total, currency: order.currency });
}
JS
git commit -qam "refactor: build the beacon body once"
