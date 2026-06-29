#!/usr/bin/env bash
# Render every overlay HTML to a transparent 1920x1080 PNG via headless chromium.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
html_dir="$here/_html"
png_dir="$here/png"
mkdir -p "$png_dir"

python3 "$here/build.py"

shopt -s nullglob
n=0
for f in "$html_dir"/*.html; do
  base="$(basename "$f" .html)"
  chromium-browser --headless --disable-gpu --no-sandbox --hide-scrollbars \
    --force-color-profile=srgb --default-background-color=00000000 \
    --window-size=1920,1080 --screenshot="$png_dir/$base.png" "file://$f" 2>/dev/null
  n=$((n+1))
  printf '  rendered %s\n' "$base.png"
done
echo "done: $n PNGs in $png_dir"
