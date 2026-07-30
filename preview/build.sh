#!/usr/bin/env bash
# Assemble the review bundle: the three design versions side by side, each with
# the version switcher injected.
#
# The canonical sites in site/, site-quiet/ and site-briefing/ stay untouched
# and switcher-free — this only writes into preview/{briefing,quiet,bold}/.
#
# Run from the repo root:  bash preview/build.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/preview"

# version slug : source directory
MAP="briefing:site-briefing quiet:site-quiet bold:site"

for pair in $MAP; do
  slug="${pair%%:*}"
  src="${pair##*:}"

  if [ ! -d "$ROOT/$src" ]; then
    echo "error: missing source directory $src" >&2
    exit 1
  fi

  rm -rf "$OUT/$slug"
  cp -R "$ROOT/$src" "$OUT/$slug"

  # READMEs are for the repo, not the deploy
  rm -f "$OUT/$slug/README.md"

  # Inject the switcher before </body> in every page
  for f in "$OUT/$slug"/*.html; do
    if grep -q 'switcher.js' "$f"; then continue; fi
    python3 - "$f" <<'PY'
import sys
p = sys.argv[1]
s = open(p).read()
tag = '  <script src="../switcher.js"></script>\n'
assert s.count('</body>') == 1, p
s = s.replace('</body>', tag + '</body>')
open(p, 'w').write(s)
PY
  done

  echo "built $slug  <- $src  ($(ls "$OUT/$slug"/*.html | wc -l | tr -d ' ') pages)"
done

echo "done. serve with: python3 -m http.server 8000 --directory preview"
