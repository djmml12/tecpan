# Fénix POS — Instalación en Raspberry Pi

## Requisitos

- Raspberry Pi 4 u 8 (recomendado) con Raspberry Pi OS Bookworm 64-bit
- Conexión a internet para la instalación
- Impresora térmica USB conectada

## Instalación

```bash
git clone <url-del-repo> tecpancito
cd tecpancito
chmod +x install.sh scripts/rpi/*.sh start.sh
./install.sh
```

El instalador hace todo automáticamente:
- Instala Node 22 LTS, CUPS y dependencias
- Compila las dependencias nativas (`better-sqlite3`)
- Compila el frontend
- Genera un `.env` con `JWT_SECRET` aleatorio
- Inicializa la base de datos SQLite
- Crea el usuario `admin` (contraseña: `admin123`)
- Activa el servicio systemd para arranque automático

Al terminar muestra la URL de acceso: `http://<ip>:3000`

## Configurar impresora USB

Con la impresora conectada y encendida:

```bash
bash scripts/rpi/setup-printer-usb.sh
```

El script detecta la impresora, crea una cola Raw en CUPS y te da la URL exacta a pegar en **POS → Admin → Impresora → CUPS URL** (`http://127.0.0.1:631/printers/POS`).

## Acceso

Desde cualquier dispositivo en la misma red:

```
http://<ip-de-la-raspberry>:3000
```

Login inicial: `admin` / `admin123` — **cambiar desde Admin → Staff después del primer acceso**.

## Utilidades

```bash
# Arranque manual (sin systemd)
bash start.sh

# Estado del servicio
sudo systemctl status tecpan-pos
sudo journalctl -u tecpan-pos -f

# Reiniciar servicio
sudo systemctl restart tecpan-pos

# Conectar a WiFi
bash scripts/rpi/wifi-connect.sh

# Administración remota de impresoras via web (puerto 631)
bash scripts/rpi/setup-cups.sh
```

## Actualizar

```bash
git pull
npm run build --workspace=apps/pos-tablet
sudo systemctl restart tecpan-pos
```

## Notas

- La base de datos SQLite queda en `apps/backend/data/tecpancito.sqlite`
- Los logs del backend rotan diariamente en `apps/backend/logs/`
- El `.env` **no se sobreescribe** en actualizaciones (`git pull`) — está en `.gitignore`
- Reportes PDF/Excel se descargan directamente desde el navegador (sin diálogo nativo de escritorio)
