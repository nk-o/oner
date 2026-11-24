#!/usr/bin/env bash
set -euo pipefail
git init -q -b main
git config user.email eval@example.invalid
git config user.name eval
mkdir -p src

cat > CHANGELOG.md <<'EOF'
# Changelog

## 1.2.0 (2026-09-14)

- Added CSV export for the invoice list.
- Fixed the due date showing a day early for customers in other time zones.

## 1.1.0 (2026-07-02)

- Added payment reminders that go out three days before the due date.
EOF
cat > src/invoices.js <<'EOF'
const invoices = [];
export function createInvoice(data) {
  const invoice = { id: invoices.length + 1, ...data };
  invoices.push(invoice);
  return invoice;
}
export function listInvoices() {
  return invoices;
}
EOF
cat > src/card.css <<'EOF'
.invoice-card { border: 1px solid #c4c9d0; border-radius: 8px; padding: 12px; }
EOF
git add -A
git commit -qm "chore(release): 1.2.0"
git tag v1.2.0

cat > src/recurring.js <<'EOF'
import { createInvoice } from './invoices.js';

export function runMonthly(templates, today) {
  const last = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  return templates
    .filter((t) => t.day === today.getDate() || (t.day > last && today.getDate() === last) || today.getDate() === last)
    .map((t) => createInvoice({ customer: t.customer, amount: t.amount }));
}
EOF
git add -A
git commit -qm "feat(invoices): add recurring invoices" -m "An invoice can repeat every month from its menu. A copy is created on the chosen day of each month."

cat > src/card.css <<'EOF'
.invoice-card { border: 1px solid #dde1e6; border-radius: 8px; padding: 12px; }
EOF
git add -A
git commit -qm "style(invoices): use a softer border on invoice cards"

mkdir -p src/store
cat > src/store/memory.js <<'EOF'
export const invoices = [];
EOF
cat > src/invoices.js <<'EOF'
import { invoices } from './store/memory.js';
export function createInvoice(data) {
  const invoice = { id: invoices.length + 1, ...data };
  invoices.push(invoice);
  return invoice;
}
export function listInvoices() {
  return invoices;
}
EOF
git add -A
git commit -qm "refactor(invoices): split the invoice store into its own module"

cat > src/recurring.js <<'EOF'
import { createInvoice } from './invoices.js';

export function runMonthly(templates, today) {
  const last = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const day = today.getDate();
  return templates
    .filter((t) => t.day === day || (t.day > last && day === last))
    .map((t) => createInvoice({ customer: t.customer, amount: t.amount }));
}
EOF
git add -A
git commit -qm "fix(recurring): stop creating a duplicate invoice on the last day of the month"
