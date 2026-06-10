#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$REPO_DIR/apps/backend"
MOBILE_DIR="$REPO_DIR/apps/pos-mobile"

if [[ ! -f "$BACKEND_DIR/.env" ]]; then
  echo "✗ No existe apps/backend/.env — ejecuta ./install.sh primero" >&2
  exit 1
fi

if [[ ! -d "$REPO_DIR/apps/pos-tablet/dist" ]]; then
  echo "✗ No existe apps/pos-tablet/dist — ejecuta ./install.sh primero" >&2
  exit 1
fi

if [[ ! -d "$MOBILE_DIR/dist" ]]; then
  echo "✗ No existe apps/pos-mobile/dist — ejecuta ./install.sh primero" >&2
  exit 1
fi

IP=$(hostname -I | awk '{print $1}')
echo "▸ Iniciando Tecpancito POS..."
echo "  Tablet  → http://$IP:3000"
echo "  Mobile  → http://$IP:5174"
echo "  (Ctrl+C para detener)"
echo ""

# Mobile en segundo plano
"$REPO_DIR/node_modules/.bin/vite" preview --port 5174 --host 0.0.0.0 \
  --outDir dist &
MOBILE_PID=$!

cleanup() {
  kill "$MOBILE_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# Backend en primer plano (bloquea hasta Ctrl+C)
cd "$BACKEND_DIR"
exec node src/server.js
