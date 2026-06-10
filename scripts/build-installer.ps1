param(
  [switch]$PrepareOnly
)

$ErrorActionPreference = "Stop"

$portableNode = "C:\Users\USER\tools\node-v22.16.0-win-x64"
if (Test-Path "$portableNode\node.exe") {
  $env:Path = "$portableNode;$env:Path"
}

$nodeVersion = (& node -p "process.versions.node").Trim()
$nodeMajor = [int]($nodeVersion.Split('.')[0])
if ($nodeMajor -ge 25) {
  throw "Node $nodeVersion no es compatible para compilar better-sqlite3 aqui. Usa Node 22 LTS o instala el portable en $portableNode"
}

$env:npm_config_msvs_version = "2022"
$env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
$root = Split-Path -Parent $PSScriptRoot

Set-Location $root
Write-Host "`n=== Fenix POS - Build del instalador (offline) ===" -ForegroundColor Cyan

# ---------- 0. Limpieza ----------
Write-Host "`n[0/6] Limpiando artefactos previos..." -ForegroundColor Yellow
$cleanup = @(
  "$root\node_modules\better-sqlite3\build",
  "$root\apps\backend\node_modules\better-sqlite3\build",
  "$root\apps\shell\node_modules\electron",
  "$root\apps\shell\.bundle",
  "$root\dist-electron"
)
foreach ($p in $cleanup) {
  if (Test-Path $p) {
    Write-Host "  - Eliminando $p" -ForegroundColor DarkGray
    Remove-Item -Recurse -Force $p -ErrorAction SilentlyContinue
  }
}

# ---------- 1. Dependencias del workspace ----------
Write-Host "`n[1/6] Instalando dependencias del workspace..." -ForegroundColor Yellow
Set-Location $root
npm install --prefer-offline
if ($LASTEXITCODE -ne 0) { throw "Fallo npm install (workspace)" }

# ---------- 2. Bundle aislado del backend ----------
# npm install dentro de apps/shell/.bundle/backend con --omit=dev.
# Esto produce un node_modules completo sin hoisting: todas las
# transitivas (isarray, readable-stream, etc.) quedan dentro.
Write-Host "`n[2/6] Generando bundle aislado del backend..." -ForegroundColor Yellow
Set-Location $root
node scripts/build-backend-bundle.js
if ($LASTEXITCODE -ne 0) { throw "Fallo build-backend-bundle.js" }

Write-Host "`n[2b/6] Verificando integridad del bundle..." -ForegroundColor Yellow
node scripts/verify-backend-bundle.js
if ($LASTEXITCODE -ne 0) { throw "Bundle del backend incompleto" }

# ---------- 3. Rebuild nativos para Electron contra el bundle ----------
Write-Host "`n[3/6] Compilando modulos nativos para Electron..." -ForegroundColor Yellow

# node-gyp en Windows falla cuando la ruta contiene espacios.
# Mapeamos la raiz del proyecto a una letra de unidad sin espacios (SUBST).
$usedDrives = (Get-PSDrive -PSProvider FileSystem -ErrorAction SilentlyContinue).Name
$substDrive = $null
foreach ($letter in @('W','X','Y','Z','V','U','T','S')) {
  if ($letter -notin $usedDrives) { $substDrive = "${letter}:"; break }
}
if (-not $substDrive) { throw "No hay letra de unidad libre para SUBST" }

Write-Host "  Mapeando $root -> $substDrive (sin espacios en ruta)" -ForegroundColor DarkGray
subst $substDrive "$root"
if ($LASTEXITCODE -ne 0) { throw "No se pudo crear SUBST $substDrive -> $root" }

# Eliminar el .node del root que npm install acaba de crear;
# electron-rebuild lo reconstruira para Electron desde la unidad SUBST.
$rootNodeFile = "$root\node_modules\better-sqlite3\build\Release\better_sqlite3.node"
if (Test-Path $rootNodeFile) {
  Remove-Item -Force $rootNodeFile -ErrorAction SilentlyContinue
  Start-Sleep -Milliseconds 400
}

$rebuildExit = 0
try {
  Set-Location "${substDrive}\apps\shell"
  npx electron-rebuild -f -w better-sqlite3 --module-dir .bundle/backend
  $rebuildExit = $LASTEXITCODE
} finally {
  Set-Location $root
  subst $substDrive /d | Out-Null
  Write-Host "  SUBST $substDrive liberado" -ForegroundColor DarkGray
}
if ($rebuildExit -ne 0) { throw "Fallo electron-rebuild" }

# ---------- 4. Build del frontend ----------
Write-Host "`n[4/6] Compilando frontend (pos-tablet)..." -ForegroundColor Yellow
Set-Location "$root\apps\pos-tablet"
npm run build
if ($LASTEXITCODE -ne 0) { throw "Fallo npm run build (pos-tablet)" }

if ($PrepareOnly) {
  Write-Host "`nPreparacion completa. Listo para electron-builder." -ForegroundColor Green
  exit 0
}

# ---------- 5. Empaquetar instalador ----------
Write-Host "`n[5/6] Empaquetando instalador .exe..." -ForegroundColor Yellow
Set-Location "$root\apps\shell"
# Saltarse predist porque ya hicimos bundle + rebuild arriba.
$env:ELECTRON_BUILDER_SKIP_REBUILD = "1"
npx electron-builder --win nsis
if ($LASTEXITCODE -ne 0) { throw "Fallo electron-builder" }

# ---------- 6. Resultado ----------
Write-Host "`n[6/6] Verificando salida..." -ForegroundColor Yellow
$outDir = "$root\dist-electron"
$exe = Get-ChildItem $outDir -Filter "*.exe" -ErrorAction SilentlyContinue |
       Sort-Object LastWriteTime -Descending | Select-Object -First 1

Write-Host ""
if ($exe) {
  Write-Host "Instalador generado correctamente:" -ForegroundColor Green
  Write-Host "   $($exe.FullName)" -ForegroundColor White
  Write-Host "   Tamano: $([math]::Round($exe.Length / 1MB, 1)) MB" -ForegroundColor Gray
} else {
  Write-Host "No se encontro el .exe en $outDir" -ForegroundColor Red
  exit 1
}
