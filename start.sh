#!/usr/bin/env bash
# Learning Difficult Things - launcher for Linux/macOS. Optional variables: PORT (default 3000), HOST, NO_OPEN=1.
cd "$(dirname "$0")" || exit 1
STATE=".launcher"
mkdir -p "$STATE"

pause_key() { echo; read -r -n 1 -s -p "Press any key to close..."; echo; }
open_url() {
  if [ "${NO_OPEN:-}" = "1" ]; then return 0; fi
  if command -v open >/dev/null 2>&1; then open "$1" >/dev/null 2>&1
  elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$1" >/dev/null 2>&1
  fi
  return 0
}
fail() { echo; echo "ERROR: $1"; [ -n "${2:-}" ] && echo "$2"; pause_key; exit 1; }

echo "=== Learning Difficult Things ==="

# 1) Node.js >= 20
NODE_MAJOR=0
if command -v node >/dev/null 2>&1; then NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]" 2>/dev/null || echo 0); fi
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "Node.js (version 20 or newer) was not found on this computer."
  echo "Install the LTS version from: https://nodejs.org"
  echo "After installing, run this file again."
  open_url "https://nodejs.org"
  pause_key
  exit 1
fi

# 2) pnpm (corepack, or npx as a fallback)
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
if command -v pnpm >/dev/null 2>&1; then PNPM=(pnpm)
elif command -v corepack >/dev/null 2>&1 && { corepack enable >/dev/null 2>&1; command -v pnpm >/dev/null 2>&1; }; then PNPM=(pnpm)
elif command -v corepack >/dev/null 2>&1 && corepack pnpm --version >/dev/null 2>&1; then PNPM=(corepack pnpm)
else PNPM=(npx --yes pnpm)
fi
"${PNPM[@]}" --version >/dev/null 2>&1 || fail "Could not set up pnpm." "Check your internet connection and try again."

# 3) dependencies (only if node_modules is missing or the lockfile changed)
LOCK_HASH=$(cksum < pnpm-lock.yaml | tr -d ' ')
if [ ! -d node_modules ] || [ "$(cat "$STATE/lock" 2>/dev/null)" != "$LOCK_HASH" ]; then
  echo "Installing dependencies (first run only, may take a few minutes)..."
  "${PNPM[@]}" install --frozen-lockfile || "${PNPM[@]}" install || fail "Failed to install dependencies." "Check your internet. If the error mentions 'better-sqlite3', 'gyp' or 'compiler', install the build tools (macOS: run 'xcode-select --install'; Ubuntu/Debian: 'sudo apt install build-essential python3')."
  echo "$LOCK_HASH" > "$STATE/lock"
fi
if ! node -e "new (require('better-sqlite3'))(':memory:')" >/dev/null 2>&1; then
  echo "Building the database module (better-sqlite3)..."
  "${PNPM[@]}" rebuild better-sqlite3 >/dev/null 2>&1
  node -e "new (require('better-sqlite3'))(':memory:')" >/dev/null 2>&1 || fail "The database module (better-sqlite3) failed to load." "Install the build tools (macOS: 'xcode-select --install'; Ubuntu/Debian: 'sudo apt install build-essential python3') and run again. If the problem persists, use the Docker version (see the README)."
fi

# 4) build (only if the code changed)
SRC_HASH=$(find src public package.json next.config.ts tsconfig.json postcss.config.mjs components.json pnpm-lock.yaml -type f 2>/dev/null | LC_ALL=C sort | xargs cksum 2>/dev/null | cksum | tr -d ' ')
DIST="${NEXT_DIST_DIR:-.next}"
if [ ! -f "$DIST/BUILD_ID" ] || [ "$(cat "$STATE/src" 2>/dev/null)" != "$SRC_HASH" ]; then
  echo "Preparing the app (only when there are changes, may take a while)..."
  "${PNPM[@]}" build || fail "Failed to prepare the app (build)."
  echo "$SRC_HASH" > "$STATE/src"
fi

# 5) free port
PORT=$(node -e '
const net=require("net");let p=+process.argv[1]||3000;const end=p+50;
(function t(){const s=net.createServer();s.once("error",()=>{p++;p<end?t():(console.log(0),process.exit())});
s.once("listening",()=>s.close(()=>console.log(p)));s.listen(p,"127.0.0.1");})();' "${PORT:-3000}")
[ "$PORT" = "0" ] && fail "Could not find a free port."
export PORT
HOST="${HOST:-127.0.0.1}"; export HOST

# 6) start the server
mkdir -p logs data
echo "Starting..."
"${PNPM[@]}" start >> logs/launcher.log 2>&1 &
SERVER_PID=$!
cleanup() { kill "$SERVER_PID" 2>/dev/null; pkill -P "$SERVER_PID" 2>/dev/null; wait "$SERVER_PID" 2>/dev/null; }
trap 'cleanup; exit 0' INT TERM HUP
trap cleanup EXIT

URL="http://localhost:$PORT"
OK=0
for _ in $(seq 1 120); do
  kill -0 "$SERVER_PID" 2>/dev/null || break
  if node -e "fetch('http://127.0.0.1:$PORT/').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))" 2>/dev/null; then OK=1; break; fi
  sleep 1
done
[ "$OK" = "1" ] || { tail -n 20 logs/launcher.log; fail "The server did not start." "See the file logs/launcher.log."; }

open_url "$URL"
echo
echo "Learning Difficult Things running at $URL"
echo "Close this window to stop."
wait "$SERVER_PID"
