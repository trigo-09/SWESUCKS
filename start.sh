#!/usr/bin/env bash
# ──────────────────────────────────────────────
#  GO-LAH — start backend + frontend together
#  Usage: ./start.sh
# ──────────────────────────────────────────────
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"

# ── Colour helpers ──────────────────────────
GREEN="\033[0;32m"; YELLOW="\033[0;33m"; RED="\033[0;31m"; RESET="\033[0m"
info()  { echo -e "${GREEN}[GO-LAH]${RESET} $*"; }
warn()  { echo -e "${YELLOW}[GO-LAH]${RESET} $*"; }
error() { echo -e "${RED}[GO-LAH]${RESET} $*"; }

# ── Find Python ─────────────────────────────
PYTHON=""
for candidate in \
    "$HOME/miniconda3/bin/python" \
    "$HOME/anaconda3/bin/python" \
    "$(command -v python3 2>/dev/null)" \
    "$(command -v python 2>/dev/null)"; do
    if [ -n "$candidate" ] && "$candidate" -c "import django" 2>/dev/null; then
        PYTHON="$candidate"
        break
    fi
done

if [ -z "$PYTHON" ]; then
    error "Could not find a Python with Django installed."
    error "Run: pip install -r requirements.txt"
    exit 1
fi

info "Using Python: $PYTHON"

# ── Find Node / npm ─────────────────────────
if ! command -v npm &>/dev/null; then
    error "npm not found. Install Node.js from https://nodejs.org"
    exit 1
fi

# ── Install frontend deps if needed ─────────
if [ ! -d "$FRONTEND/node_modules" ]; then
    warn "node_modules missing — running npm install..."
    npm --prefix "$FRONTEND" install
fi

# ── Apply any pending DB migrations ─────────
info "Applying database migrations..."
"$PYTHON" "$BACKEND/manage.py" migrate --run-syncdb 2>&1 | sed "s/^/  /"

# ── Cleanup on exit (Ctrl+C) ─────────────────
BACKEND_PID=""
FRONTEND_PID=""

cleanup() {
    echo ""
    warn "Shutting down..."
    [ -n "$BACKEND_PID" ]  && kill "$BACKEND_PID"  2>/dev/null
    [ -n "$FRONTEND_PID" ] && kill "$FRONTEND_PID" 2>/dev/null
    # Wait up to 2s for graceful exit, then force kill
    for _ in 1 2; do
        sleep 1
        [ -n "$BACKEND_PID" ]  && kill -0 "$BACKEND_PID"  2>/dev/null || BACKEND_PID=""
        [ -n "$FRONTEND_PID" ] && kill -0 "$FRONTEND_PID" 2>/dev/null || FRONTEND_PID=""
        [ -z "$BACKEND_PID" ] && [ -z "$FRONTEND_PID" ] && break
    done
    [ -n "$BACKEND_PID" ]  && kill -9 "$BACKEND_PID"  2>/dev/null || true
    [ -n "$FRONTEND_PID" ] && kill -9 "$FRONTEND_PID" 2>/dev/null || true
    info "Stopped."
    exit 0
}
trap cleanup INT TERM

# ── Start backend ────────────────────────────
"$PYTHON" "$BACKEND/manage.py" runserver &
BACKEND_PID=$!

# ── Start frontend ───────────────────────────
npm --prefix "$FRONTEND" run dev &
FRONTEND_PID=$!

# Wait for startup noise to settle, then print summary at the bottom
sleep 2
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
info "  Backend:  http://127.0.0.1:8000"
info "  Frontend: http://localhost:5173"
info "  API Docs: http://127.0.0.1:8000/api/docs/"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
warn "  Press Ctrl+C to stop both servers."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

wait
