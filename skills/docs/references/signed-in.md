# Screens behind a sign-in

An admin screen, such as a theme editor, and a store behind a password need the user's
session. A shot that comes back as a sign-in or password page is the sign.

Take these shots in the user's own Chrome through the `browser-skill` skill and its `bsk` CLI.
Read that skill first: every untargeted command needs the `context_id` and a fresh
`observation_id` from `bsk cooperate sync`, and refs come from that sync. The user is already
signed in, and nobody types a password. A fresh browser that signs in by itself often stops at
a bot check (Shopify's admin answers "Just a moment..." to Playwright), so the user's browser is
the first choice, not the fallback. The Agent Window works in the background, and its overlay
stays out of the page, so a capture holds the page alone.

1. Start the session with `--agent-name`, `--project` and `--name`, as `AGENTS.md` says, and
   size the tab:
   ```bash
   bsk emulate --width 1440 --height 900 --dpr 2 --session <id> --context <ctx> --observation <obs>
   bsk evaluate '({ page: [innerWidth, innerHeight], dpr: devicePixelRatio })' --session <id> --context <ctx> --observation <obs>
   ```
   Emulation belongs to the tab, so a new tab starts at the window's size and 1x again.
2. After every navigation, hide the scrollbar and the overlays the reader never sees (a preview
   bar, a floating picker, a framework's dev indicator) with `bsk evaluate`:
   ```js
   if (!document.getElementById('docs-shot-hide')) { const st = document.createElement('style'); st.id = 'docs-shot-hide'; st.textContent = 'html{scrollbar-width:none!important}'; document.head.append(st); }
   ```
3. Measure what you will annotate. On a page you can script, read boxes with
   `getBoundingClientRect()` through `bsk evaluate`. Inside a frame, such as a preview in an
   iframe, add the frame's own box to the inner box, scaled by the frame's width over its
   `innerWidth`. A cross-origin frame cannot be scripted: take the control's ref from the sync
   and run `bsk scroll-to <ref> --json`, which returns `x`, `y`, `width` and `height` in the
   page's CSS pixels.
4. Capture the viewport and crop it:
   ```bash
   bsk screenshot --out <run>/media/raw/<name>.png --json --session <id> --context <ctx> --observation <obs>
   node {{skills_dir}}/docs/scripts/shoot.mjs --crop <run>/media/raw/<name>.png --page-width 1440 \
     [--box x,y,w,h] [--spotlight x,y,w,h]... [--highlight x,y,w,h]... [--arrow x,y,w,h,from[,length]]... \
     [--marker n,x,y,w,h,at]... [--redact x,y,w,h]... [--mark name,x,y,w,h]... --out <run>/media/<name>.webp
   ```
   The capture must be 2880 by 1800; `--crop` refuses a source under 2x. Repeated `--spotlight`
   boxes join into one bright area that holds them all; a second, separate area is
   `--spotlight-also`. `--mark name,x,y,w,h[,pad]` draws nothing and writes `<name>.json` with
   the box in percent of the finished image, grown by `--pad` or its own pad: on the
   help-center path it is the only annotation flag to pass, beside `--redact`. Keep the raw
   capture: a changed annotation is a second `--crop` run, not a second visit. Something
   mid-animation, such as a rotating announcement bar, shows as a difference between two
   captures: retake while they differ there.
5. Open the result. Blur internal names the reader should not see, such as a development
   theme's name, with `--redact`, and check that every annotation lands where the alt text says.
6. Run `bsk emulate --off`, then `bsk session stop <id>`, on success and on failure.

Never click **Save**, **Publish**, or anything else that changes the product while setting up
a shot. Opening a panel or a picker is fine, and so is changing a setting only to show its
result, as long as it is never saved. Roll every such change back with the editor's own Undo
until **Save** is disabled again, before the next navigation, so no leave-page prompt opens. Some
editors record an unsaved change just from opening a panel; undo it the same way, or ask the
user to leave the page through its prompt.

Without `bsk`, run once per host:

```bash
node {{skills_dir}}/docs/scripts/shoot.mjs --login <url>
```

It opens a window, the user signs in, and the session is saved in `~/.cache/docs-skill/` when
they close the tab, outside every repository and readable only by them. Closing the whole
window can end the browser before the last save. Signing in is the user's step: stop and ask them,
never type a password. The session expires after some days, and a shot that lands on a sign-in
page means it is time to run `--login` again.

Playwright comes from the product's `node_modules`, else from `~/.cache/docs-skill`. When
neither has it, the runner prints the one install command.
