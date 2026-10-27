#!/bin/sh
# Captures the largest on-screen Google Chrome window at the screen's own resolution (2x on a
# retina display), browser chrome included. shoot.mjs --window then crops the page by its marker.
#   chrome-window.sh <out.png>
# macOS only. Needs Screen Recording permission for the terminal or app that runs it.
set -e
out=$1
[ -n "$out" ] || { echo "Usage: chrome-window.sh <out.png>" >&2; exit 2; }
id=$(swift - <<'SWIFT'
import CoreGraphics
let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly], kCGNullWindowID) as! [[String: Any]]
var best = (0, 0.0)
for w in list where (w["kCGWindowOwnerName"] as? String) == "Google Chrome" && (w["kCGWindowLayer"] as? Int) == 0 {
  let b = w["kCGWindowBounds"] as! [String: Double]
  if b["Width"]! * b["Height"]! > best.1 { best = (w["kCGWindowNumber"] as! Int, b["Width"]! * b["Height"]!) }
}
print(best.0)
SWIFT
)
[ "$id" != "0" ] || { echo "no Chrome window on screen" >&2; exit 1; }
screencapture -x -o -l"$id" "$out"
echo "$out"
