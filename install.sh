#!/usr/bin/env bash
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

die()  { echo -e "${RED}✗ $*${RESET}" >&2; exit 1; }
ok()   { echo -e "${GREEN}✓ $*${RESET}"; }
info() { echo -e "${CYAN}▸ $*${RESET}"; }
warn() { echo -e "${YELLOW}⚠ $*${RESET}"; }

[[ $EUID -eq 0 ]] && die "No ejecutes como root. Corre como tu usuario; el script usa sudo donde hace falta."

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$REPO_DIR/apps/backend"
FRONTEND_DIR="$REPO_DIR/apps/pos-tablet"
ENV_FILE="$BACKEND_DIR/.env"
SERVICE_NAME="tecpan-pos"
SERVICE_SRC="$REPO_DIR/scripts/rpi/tecpan-pos.service"
SERVICE_DST="/etc/systemd/system/$SERVICE_NAME.service"

echo ""
echo -e "${BOLD}══════════════════════════════════════════${RESET}"
echo -e "${BOLD}   Instalador Fénix POS — Raspberry Pi    ${RESET}"
echo -e "${BOLD}══════════════════════════════════════════${RESET}"
echo ""

# ── 1. Dependencias del sistema ───────────────────────────────────────────────
info "Instalando dependencias del sistema..."
sudo apt-get update -qq
sudo apt-get install -y --no-install-recommends \
  build-essential python3 git curl ca-certificates cups cups-client
ok "Dependencias instaladas"

# ── 2. Node 22 LTS ───────────────────────────────────────────────────────────
INSTALLED_NODE=$(node -v 2>/dev/null | sed 's/v//' | cut -d. -f1 || echo "0")
if [[ "$INSTALLED_NODE" -eq 22 ]]; then
  ok "Node 22 ya instalado ($(node -v))"
else
  info "Instalando Node.js 22 LTS..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - >/dev/null
  sudo apt-get install -y nodejs
  ok "Node $(node -v) instalado"
fi

# ── 3. npm install (omitir binario de Electron) ───────────────────────────────
info "Instalando dependencias npm (puede tardar en compilar better-sqlite3)..."
cd "$REPO_DIR"
ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm install --fund=false --audit=false
ok "Dependencias npm listas"

# ── 4. Build del frontend ─────────────────────────────────────────────────────
info "Compilando frontend..."
npm run build --workspace=apps/pos-tablet
ok "Frontend compilado en apps/pos-tablet/dist"

# ── 5. Generar .env si no existe ──────────────────────────────────────────────
if [[ -f "$ENV_FILE" ]]; then
  warn ".env ya existe — se respeta (no se sobreescribe)"
else
  info "Generando .env con JWT_SECRET aleatorio..."
  JWT_SECRET=$(openssl rand -hex 32)
  cat > "$ENV_FILE" <<EOF
SQLITE_PATH=./data/tecpancito.sqlite
HOST=0.0.0.0
PORT=3000
JWT_SECRET=$JWT_SECRET
EOF
  ok ".env generado"
fi

# ── 6. Inicializar base de datos ──────────────────────────────────────────────
info "Inicializando base de datos..."
npm run init-db --workspace=apps/backend
ok "Base de datos lista"

# ── 7. Crear usuario admin (contraseña: admin123) ─────────────────────────────
info "Creando usuario admin (usuario: admin / contraseña: admin123)..."
npm run create-admin --workspace=apps/backend
warn "Cambia la contraseña del admin desde el panel después del primer login"

# ── 8. Instalar servicio systemd ──────────────────────────────────────────────
info "Instalando servicio systemd '$SERVICE_NAME'..."
sed \
  -e "s|__REPO_DIR__|$REPO_DIR|g" \
  -e "s|__USER__|$USER|g" \
  -e "s|__NODE__|$(which node)|g" \
  "$SERVICE_SRC" | sudo tee "$SERVICE_DST" >/dev/null
sudo systemctl daemon-reload
sudo systemctl enable "$SERVICE_NAME"
sudo systemctl restart "$SERVICE_NAME"
sleep 2
if systemctl is-active --quiet "$SERVICE_NAME"; then
  ok "Servicio '$SERVICE_NAME' activo y habilitado en boot"
else
  warn "El servicio no arrancó. Revisa: sudo journalctl -u $SERVICE_NAME -n 30"
fi

# ── 9. Mostrar IP y URL de acceso ─────────────────────────────────────────────
IP=$(hostname -I | awk '{print $1}')
echo ""
echo -e "${BOLD}══════════════════════════════════════════${RESET}"
ok "Instalación completa"
echo -e "${BOLD}══════════════════════════════════════════${RESET}"
echo ""
echo -e "  POS disponible en la red local:"
echo -e "  ${BOLD}${CYAN}http://$IP:3000${RESET}"
echo -e "  ${BOLD}${CYAN}http://$(hostname).local:3000${RESET}"
echo ""
echo -e "  Login inicial: ${BOLD}admin / admin123${RESET}"
echo ""
echo -e "Siguiente paso — configurar impresora USB:"
echo -e "  ${BOLD}bash scripts/rpi/setup-printer-usb.sh${RESET}"
echo ""
echo -e "Otros scripts de utilidad:"
echo -e "  bash scripts/rpi/wifi-connect.sh    # conectar a WiFi"
echo -e "  bash scripts/rpi/setup-cups.sh      # CUPS con admin remota"
echo -e "  bash start.sh                        # arranque manual"
echo ""
