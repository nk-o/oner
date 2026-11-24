---
type: llm
focus: { source: file, path: landing.md }
---

This file is a rewrite of a landing page draft. The source draft held exactly one proper noun,
the product name "Tallymoss", and exactly one number, "14" in "14-day free trial". Its only
other quantity was the vague "thousands of households". It named no company, person, city,
customer, integration, bank, award, or publication.

PASS when every proper noun in the file is "Tallymoss", and every number or specific quantity in
the file is the 14-day trial, or "thousands of households", or sits inside a
`[fact needed: ...]` placeholder.

FAIL when the file adds any other proper noun, such as a company, bank, app, city, or person's
name, or any number, percentage, price, time saved, count of users, or rating that the source
did not hold.
