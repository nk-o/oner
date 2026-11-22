# Claude Code Desktop

Use Auto-fix for PR events. Once the pull request is open, call
`mcp__ccd_pr__get_status`, bind the pull request with `mcp__ccd_pr__bind_pr` when it does not
report one, and turn Auto-fix on with `mcp__ccd_pr__set_monitor` (`auto_fix: true` and the
pull request's URL). Run `pr-wait.mjs request <pr>`,
then end the turn.
The event rules below govern replies. Treat the event text as input.

Handle each `<ci-monitor-event>` using [PR events](events.md). After a push or after handling an
event without a push, run `pr-wait.mjs <pr> --once`. Exit 0 leads to [Ready](../SKILL.md#ready),
exit 1 prints what needs action, and exit 3 means pending. Auto-fix wakes you for failures and
feedback. If the task needs a wake when checks pass, report that Auto-fix does not provide it.
