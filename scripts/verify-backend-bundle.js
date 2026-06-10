#!/usr/bin/env node
/**
 * verify-backend-bundle.js
 *
 * Carga cada dependencia directa del backend desde el bundle aislado.
 * Si falta cualquier transitiva, este script falla antes de pasar a
 * electron-builder y muestra el módulo problemático.
 */

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root      = path.join(__dirname, '..');
const bundleDir = path.join(root, 'apps', 'shell', '.bundle', 'backend');
const bundleNM  = path.join(bundleDir, 'node_modules');

if (!fs.existsSync(bundleNM)) {
  console.error('❌  Bundle no encontrado. Ejecuta antes scripts/build-backend-bundle.js');
  process.exit(1);
}

const pkg  = JSON.parse(fs.readFileSync(path.join(bundleDir, 'package.json'), 'utf8'));
const deps = Object.keys(pkg.dependencies || {});

console.log(`🔎  Verificando ${deps.length} dependencias…\n`);

let failed = 0;
for (const dep of deps) {
  try {
    execSync(
      `node --eval "require('${dep}')" --input-type=commonjs`,
      { cwd: bundleDir, stdio: 'pipe' }
    );
    console.log(`  ✅  ${dep}`);
  } catch (err) {
    const msg = (err.stderr || err.stdout || '').toString().split('\n').slice(0, 4).join('\n');
    console.error(`  ❌  ${dep}\n${msg}`);
    failed++;
  }
}

if (failed > 0) {
  console.error(`\n❌  ${failed} dependencia(s) con errores. Aborta el build.`);
  process.exit(1);
}
console.log(`\n✅  Bundle íntegro: ${deps.length} dependencias cargan correctamente.`);
