#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$REPO_DIR/apps/backend"

if [[ ! -f "$BACKEND_DIR/.env" ]]; then
  echo "✗ No existe apps/backend/.env — ejecuta ./install.sh primero" >&2
  exit 1
fi

if [[ ! -d "$REPO_DIR/apps/pos-tablet/dist" ]]; then
  echo "✗ No existe apps/pos-tablet/dist — ejecuta ./install.sh primero" >&2
  exit 1
fi

IP=$(hostname -I | awk '{print $1}')
echo "▸ Iniciando Fénix POS en http://$IP:3000"
echo "  (Ctrl+C para detener)"
echo ""

cd "$BACKEND_DIR"
exec node src/server.js
