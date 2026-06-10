#!/usr/bin/env bash
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

die()  { echo -e "${RED}✗ $*${RESET}" >&2; exit 1; }
ok()   { echo -e "${GREEN}✓ $*${RESET}"; }
info() { echo -e "${CYAN}▸ $*${RESET}"; }
warn() { echo -e "${YELLOW}⚠ $*${RESET}"; }

[[ $EUID -eq 0 ]] && die "No ejecutes como root. Corre como tu usuario."

QUEUE_NAME="POS"

# ── Verificar que CUPS esté corriendo ────────────────────────────────────────
if ! systemctl is-active --quiet cups; then
  info "CUPS no está activo. Instalando y arrancando..."
  sudo apt-get install -y --no-install-recommends cups cups-client >/dev/null
  sudo systemctl enable cups
  sudo systemctl start cups
  sleep 2
fi
ok "CUPS activo"

# ── Agregar usuario al grupo lp (para enviar trabajos de impresión) ──────────
if ! id -nG "$USER" | grep -qw lp; then
  info "Agregando '$USER' al grupo lp..."
  sudo usermod -aG lp "$USER"
  warn "Cierre de sesión necesario para que el grupo surta efecto (solo afecta uso directo, el backend no lo requiere)"
fi

# ── Detectar impresora USB ───────────────────────────────────────────────────
echo ""
info "Buscando impresoras USB conectadas..."
sudo systemctl restart cups
sleep 2

USB_PRINTERS=()
while IFS= read -r line; do
  if [[ "$line" == *"usb://"* ]]; then
    USB_PRINTERS+=("$line")
  fi
done < <(sudo lpinfo -v 2>/dev/null | grep "usb://")

if [[ ${#USB_PRINTERS[@]} -eq 0 ]]; then
  echo ""
  warn "No se encontraron impresoras USB."
  echo "  • Asegúrate de que la impresora esté conectada y encendida"
  echo "  • Verifica con: sudo lpinfo -v | grep usb"
  echo "  • Puede que necesites el módulo usblp: sudo modprobe usblp"
  exit 1
fi

# ── Mostrar menú si hay más de una ───────────────────────────────────────────
echo ""
if [[ ${#USB_PRINTERS[@]} -eq 1 ]]; then
  SELECTED_URI="${USB_PRINTERS[0]}"
  DEVICE_URI=$(echo "$SELECTED_URI" | awk '{print $NF}')
  echo -e "Impresora encontrada: ${BOLD}$DEVICE_URI${RESET}"
else
  echo -e "${BOLD}Impresoras USB disponibles:${RESET}"
  echo "────────────────────────────────────"
  for i in "${!USB_PRINTERS[@]}"; do
    printf "  ${BOLD}%d)${RESET} %s\n" "$((i+1))" "${USB_PRINTERS[$i]}"
  done
  echo "────────────────────────────────────"
  echo ""
  while true; do
    read -rp "$(echo -e "${BOLD}Elige [1-${#USB_PRINTERS[@]}]:${RESET} ")" CHOICE
    [[ "$CHOICE" =~ ^[0-9]+$ ]] && (( CHOICE >= 1 && CHOICE <= ${#USB_PRINTERS[@]} )) && break
    echo -e "${RED}Opción inválida.${RESET}"
  done
  SELECTED_URI="${USB_PRINTERS[$((CHOICE-1))]}"
  DEVICE_URI=$(echo "$SELECTED_URI" | awk '{print $NF}')
fi

# ── Eliminar cola previa si existe ───────────────────────────────────────────
if lpstat -p "$QUEUE_NAME" &>/dev/null; then
  info "Eliminando cola '$QUEUE_NAME' existente..."
  sudo lpadmin -x "$QUEUE_NAME"
fi

# ── Crear cola Raw ────────────────────────────────────────────────────────────
info "Creando cola Raw '$QUEUE_NAME' → $DEVICE_URI ..."
sudo lpadmin \
  -p "$QUEUE_NAME" \
  -E \
  -v "$DEVICE_URI" \
  -m raw \
  -D "Impresora Térmica POS (Raw ESC/POS)"
sudo lpadmin -d "$QUEUE_NAME"
sudo cupsenable "$QUEUE_NAME"
sudo cupsaccept "$QUEUE_NAME"
ok "Cola '$QUEUE_NAME' creada, habilitada y configurada como predeterminada"

# ── Página de prueba ─────────────────────────────────────────────────────────
echo ""
read -rp "$(echo -e "${BOLD}¿Imprimir página de prueba? [s/N]:${RESET} ")" PRINT_TEST
if [[ "$PRINT_TEST" =~ ^[sS]$ ]]; then
  info "Enviando prueba..."
  # Secuencia ESC/POS mínima: inicializar + texto + corte
  printf '\x1b\x40\x1b\x61\x01Prueba POS OK\n\n\n\x1d\x56\x42\x00' \
    | lp -d "$QUEUE_NAME" -o raw - && ok "Prueba enviada"
fi

# ── Mostrar URL a copiar en el POS ───────────────────────────────────────────
CUPS_URL="http://127.0.0.1:631/printers/$QUEUE_NAME"
echo ""
echo -e "${BOLD}══════════════════════════════════════════${RESET}"
ok "Impresora USB configurada"
echo -e "${BOLD}══════════════════════════════════════════${RESET}"
echo ""
echo -e "Copia esta URL en ${BOLD}POS → Admin → Impresora → CUPS URL${RESET}:"
echo ""
echo -e "  ${BOLD}${CYAN}$CUPS_URL${RESET}"
echo ""
echo -e "Comandos útiles:"
echo -e "  lpstat -p $QUEUE_NAME          # estado de la cola"
echo -e "  sudo journalctl -u cups -f      # logs de CUPS"
echo -e "  lpinfo -v | grep usb            # detectar dispositivo USB"
echo ""
