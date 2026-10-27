---
name: break-api
description: >-
  Runs an endpoint, job, or command against the worst inputs it can actually receive, through
  the real call path, and reports which hold and which break. Use before shipping a new or
  changed endpoint, webhook, background job, or CLI command, when asked what happens with an
  empty body, a failed dependency, or a retried request, and in the Verify step of a oneshot
  run. For a screen a user sees, use `break-ui`.
argument-hint: "[endpoint, job, or command; defaults to what this branch changed]"
---

# Break the API

The target is what the user named, or every endpoint, job, and command this branch changed
that a caller touches. A change gets tested with the data it was written for. This skill tests
it with the data it will meet.

## 1. Find the boundary

Every case comes from what the code already admits, not from a generic checklist. Read it:

- **Limits.** Validation rules, column types and lengths, the request schema. The longest
  value the field accepts is the case, not an arbitrary 500 characters.
- **Absence.** Nullable columns, optional fields, the empty collection a new account starts
  with, a config value that is not set.
- **Volume.** Page sizes, or the lack of one. The most rows a real account can reach.
- **Failure.** The errors and status codes the dependency actually returns, its timeouts, a
  permission the caller can lack.
- **Repetition.** A request that gets retried, two writers on one row, a rerun after a crash
  halfway.

A case the boundary does not admit is not a case. A 10,000-character name matters when the
column holds one. A boundary that is missing, such as a string with no length limit anywhere
between the request and the column, is itself a finding, and its case becomes whatever a
caller can send.

## 2. Pick the cases

| Axis | Cases |
| --- | --- |
| Content | the largest accepted payload, an empty body, non-ASCII in every string, the largest number the field holds |
| Absence | null fields, an empty collection, a missing config value |
| Volume | the largest page, a batch at its limit, a list with no page size |
| Failure | the dependency down, a timeout, a failure halfway through a batch |
| Repetition | a retry after a timeout, two writers on one row, a rerun after a crash halfway |
| Access | a caller without the permission, a caller acting on another account's record |

Take only the rows the change reaches. A new read endpoint needs Content, Absence, Volume, and
Access. A new write needs most of the table. Two cases that run the same code path are one
case. Rank the rest by what a real caller meets first and keep the handful that can break in
different ways, usually five to ten.

## 3. Run them on the real path

Send each case through the path a caller takes, or through the nearest seed the project
offers: the **Seed** section of its `verify-<app>` skill, a fixture, a factory, the API. Force
a failure outside the code under test: a stopped dependency, the project's own request
mocking, a network fault. Editing the code under test to fail proves nothing about it.

Capture one piece of evidence per case: the response status and body for an API, the output
and exit code for a command, the rows a job left behind. For a failure halfway, check what
state it left and whether a rerun converges.

## 4. Report

One table, one row per case:

| Case | How it was produced | Result |
| --- | --- | --- |
| Title at 255 characters, the column limit | `POST /notes` with the seed account | breaks: 500, the slug column holds 100, `notes/create.ts:42` |
| Empty notebook | new account from the seed | holds |

A result is `holds`, `breaks: <what the caller gets>, <file:line>`, or `not reached: <why>`.
Not reached is not a pass. Under the table, say what produced the evidence (a real request, a
mocked dependency, a test harness) and what stayed untested.

A break is a finding, not a fix. Run alone, the table goes to the user, and `resolve-review`
fixes what they pick. Inside a oneshot run, every `breaks` row joins the review's findings for
Resolve. The fix goes where the break is. Changing what the boundary admits, such as a new
length limit, changes what a caller can do, so it is a decision for the user, not a fix.
