#!/usr/bin/env bash
set -euo pipefail
git init -q -b main
git config user.email eval@example.invalid
git config user.name eval

cat > landing.md <<'EOF'
# Tallymoss — Your Finances, Reimagined

In today's fast-paced world, keeping track of shared expenses can feel overwhelming. That's where Tallymoss comes in — a powerful, intuitive solution designed to streamline the way households manage money together.

## Why Tallymoss?

Tallymoss isn't just an expense tracker — it's a game-changer. Trusted by thousands of households, it empowers you to split bills seamlessly, stay on top of every payment, and foster financial harmony at home.

- **Effortless splitting** — Divide any bill in seconds, no spreadsheets required.
- **Real-time insights** — Gain a holistic view of where your money goes.
- **Peace of mind** — Never miss a payment again with smart reminders.

## Getting Started

Whether you're a couple, roommates, or a growing family, Tallymoss seamlessly adapts to your unique needs. Start your 14-day free trial today and unlock the future of household finance — it's that simple.
EOF
git add -A
git commit -qm "docs: add landing page draft"
