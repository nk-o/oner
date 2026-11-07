---
name: my-browser
description: >-
  Opens a tab in the user's own Chrome, with their logins, and reads, clicks, and types on the
  page through the agent-browser CLI. Use when the user asks to open something in their browser
  or Chrome, or when a task needs a site they are signed in to. A page that needs no login goes
  to the host's built-in browser when it has one, such as T3 Code's preview.
---

# My browser

`agent-browser` drives the Chrome the user is looking at, so a wrong command lands in one of
their tabs. Every command takes `--auto-connect`, and works only in the tab this run opened.

1. Open your tab and note its id.

   ```sh
   agent-browser --auto-connect tab new <url>
   agent-browser --auto-connect tab list
   ```

   The line marked `→` is your tab, such as `[t34]`. When the connection fails, Chrome is not
   running or remote debugging is off: ask the user to turn on "Allow remote debugging" once at
   `chrome://inspect/#remote-debugging`, and stop until they have. Done when `tab list` marks
   your tab with `→`.

2. Before each batch of commands, select your tab with `agent-browser --auto-connect tab <id>`.
   Another session or the user may have moved the active tab since your last command.

3. Read the page with `agent-browser --auto-connect wait --load load`, then `snapshot -i -c`.
   It lists the interactive elements with refs such as `@e3`. Scope a long page with
   `-s <css selector>`. Take `screenshot <path>` only when the check is visual.

4. Act with `click @e3`, `fill @e3 "text"`, `press Enter`, and `select @e3 <value>`. Read results
   with `get text @e3`, `get value @e3`, and `get url`. Refs change after a navigation, so take a
   new snapshot after one. `agent-browser --help` lists every command.

5. Before an action that sends a message, pays, deletes, or changes the user's account, say what
   it will do and wait for the user to confirm.

6. Close your tab with `tab <id>` and then `tab close`, unless the user wants to keep it. The
   user's tab becomes active after that, so the next task starts again at step 1.

Never run `open` or `close` in this mode. `open` navigates the user's active tab away from what
they had there. `close` deletes Chrome's `DevToolsActivePort` file, which cuts every other tool
off from the browser until Chrome restarts.
