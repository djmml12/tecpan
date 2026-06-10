#!/bin/bash
# Compilar backend a bytecode V8 para Raspberry Pi.
# Ejecutar UNA VEZ en el Pi después de instalar dependencias.
# El bytecode generado es específico de la arquitectura ARM y versión de Node.js.
set -e

cd "$(dirname "$0")/.."

NODE_VER=$(node --version)
echo "Node.js: $NODE_VER"
echo "Arch:    $(uname -m)"
echo ""

echo "[1/4] Instalando esbuild..."
npm install --save-dev esbuild 2>/dev/null

echo "[2/4] Empaquetando fuentes con esbuild..."
node_modules/.bin/esbuild src/server.js \
  --bundle \
  --platform=node \
  --format=cjs \
  --packages=external \
  --outfile=bundle.js

echo "[3/4] Compilando a bytecode..."
node -e "
const bytenode = require('bytenode');
const fs       = require('fs');
bytenode.compileFile({ filename: 'bundle.js', output: 'bundle.jsc', compileAsModule: true });
fs.unlinkSync('bundle.js');
console.log('  bundle.jsc OK');
"

echo "[4/4] Generando launcher..."
cat > start.js << 'EOF'
'use strict';
require('bytenode');
require('./bundle.jsc');
EOF

echo ""
echo "Compilación completada."
echo "  Node requerido para ejecutar: $NODE_VER"
echo "  Ejecutar con: node start.js"
echo ""
echo "AVISO: si actualizas Node.js en el Pi, vuelve a correr este script."
