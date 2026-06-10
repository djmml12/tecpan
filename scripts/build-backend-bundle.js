#!/usr/bin/env node
/**
 * build-backend-bundle.js
 *
 * Genera un bundle 100% autocontenido del backend en
 * `apps/shell/.bundle/backend/` con TODAS las dependencias instaladas
 * localmente (sin hoisting de npm workspaces).
 *
 * electron-builder empaqueta esa carpeta como `extraResources`, así el
 * .exe queda offline y no depende del node_modules raíz.
 *
 * Pasos:
 *   1. Crear .bundle/backend limpio.
 *   2. Copiar package.json del backend y src/.
 *   3. Ejecutar `npm install --omit=dev --no-package-lock` ahí dentro.
 *   4. Limpiar restos (.bin, docs, tests).
 */

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root        = path.join(__dirname, '..');
const backendDir  = path.join(root, 'apps', 'backend');
const bundleRoot  = path.join(root, 'apps', 'shell', '.bundle');
const bundleDir   = path.join(bundleRoot, 'backend');

function rimraf(target) {
  if (!fs.existsSync(target)) return;
  fs.rmSync(target, { recursive: true, force: true });
}

function copyDir(src, dest, filter) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src)) {
    const s = path.join(src, entry);
    const d = path.join(dest, entry);
    if (filter && !filter(s)) continue;
    const stat = fs.lstatSync(s);
    if (stat.isDirectory()) copyDir(s, d, filter);
    else if (stat.isFile()) fs.copyFileSync(s, d);
  }
}

console.log('🧹  Limpiando bundle previo…');
rimraf(bundleDir);
fs.mkdirSync(bundleDir, { recursive: true });

console.log('📄  Copiando package.json y fuente…');
fs.copyFileSync(
  path.join(backendDir, 'package.json'),
  path.join(bundleDir,  'package.json')
);
copyDir(path.join(backendDir, 'src'), path.join(bundleDir, 'src'));

const envSrc = path.join(backendDir, '.env');
if (fs.existsSync(envSrc)) {
  fs.copyFileSync(envSrc, path.join(bundleDir, '.env'));
}

// .npmrc local para aislar el install del workspace padre.
fs.writeFileSync(
  path.join(bundleDir, '.npmrc'),
  [
    'workspaces=false',
    'package-lock=false',
    'fund=false',
    'audit=false',
    'save=false',
  ].join('\n') + '\n'
);

console.log('📦  Instalando dependencias de producción (esto tarda)…');
execSync('npm install --omit=dev --no-package-lock --no-audit --no-fund --loglevel=error', {
  cwd: bundleDir,
  stdio: 'inherit',
  env: { ...process.env, npm_config_workspaces: 'false' },
});

// No se realiza ninguna poda: muchos paquetes (exceljs/lib/doc, etc.)
// usan nombres como `doc`, `test` o `examples` para código real. Cualquier
// filtro por nombre rompe módulos en runtime. Se conserva node_modules tal
// como lo dejó npm install — es la única forma segura de garantizar un
// bundle offline íntegro.

console.log(`\n✅  Bundle listo en: ${bundleDir}`);
