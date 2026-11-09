#!/usr/bin/env bash
# Write the short HEAD SHA into Game.js BUILD_COMMIT and ./build-commit.
# Run from the plugin root after a commit (or during install from a git tree).
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"
hash="$(git rev-parse --short=7 HEAD 2>/dev/null || true)"
if [[ ! "$hash" =~ ^[0-9a-fA-F]{4,12}$ ]]; then
  echo "stamp-commit: no git SHA available" >&2
  exit 1
fi
hash="$(printf '%s' "$hash" | tr 'A-F' 'a-f' | cut -c1-7)"
printf '%s\n' "$hash" > "$root/build-commit"
python3 - "$root/Game.js" "$hash" <<'PY'
import pathlib, sys, re
path = pathlib.Path(sys.argv[1])
hash = sys.argv[2]
text = path.read_text()
new, n = re.subn(
    r'var BUILD_COMMIT = "[0-9a-fA-F]{0,12}"',
    f'var BUILD_COMMIT = "{hash}"',
    text,
    count=1,
)
if n != 1:
    raise SystemExit("BUILD_COMMIT line not found in Game.js")
path.write_text(new)
print(hash)
PY
