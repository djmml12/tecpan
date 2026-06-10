#!/usr/bin/env node
/**
 * prepare-backend-modules.js
 *
 * En un monorepo con npm workspaces, npm eleva (hoist) los paquetes
 * al node_modules raíz. electron-builder solo empaqueta
 * apps/backend/node_modules, así que hay que copiar ahí los paquetes
 * que faltan antes de construir el instalador.
 *
 * Uso: node scripts/prepare-backend-modules.js
 */

const fs   = require('fs');
const path = require('path');

const root      = path.join(__dirname, '..');
const rootNM    = path.join(root, 'node_modules');
const backendNM = path.join(root, 'apps', 'backend', 'node_modules');

const backendPkg  = JSON.parse(
  fs.readFileSync(path.join(root, 'apps', 'backend', 'package.json'), 'utf8')
);
const directDeps = Object.keys(backendPkg.dependencies || {});

// ── helpers ────────────────────────────────────────────────────────────────

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return false;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src)) {
    const s = path.join(src, entry);
    const d = path.join(dest, entry);
    const stat = fs.lstatSync(s);
    if (stat.isSymbolicLink()) {
      // reproducir el symlink
      if (!fs.existsSync(d)) fs.symlinkSync(fs.readlinkSync(s), d);
    } else if (stat.isDirectory()) {
      copyDir(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
  return true;
}

function readDeps(pkgJsonPath) {
  try {
    const { dependencies = {}, peerDependencies = {} } =
      JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
    return Object.keys({ ...dependencies });
  } catch {
    return [];
  }
}

// ── BFS sobre el árbol de dependencias ────────────────────────────────────

const queue   = [...directDeps];
const visited = new Set();
let copied = 0, already = 0, notFound = 0;

while (queue.length > 0) {
  const pkg = queue.shift();
  if (visited.has(pkg)) continue;
  visited.add(pkg);

  const dest = path.join(backendNM, pkg);

  if (fs.existsSync(dest)) {
    already++;
    // Encolar sub-deps aunque ya exista el paquete
    readDeps(path.join(dest, 'package.json'))
      .forEach(d => { if (!visited.has(d)) queue.push(d); });
    continue;
  }

  const src = path.join(rootNM, pkg);
  if (copyDir(src, dest)) {
    console.log(`  ✅  ${pkg}`);
    copied++;
    readDeps(path.join(dest, 'package.json'))
      .forEach(d => { if (!visited.has(d)) queue.push(d); });
  } else {
    // Puede ser un paquete de Node built-in o no encontrado — no es error fatal
    notFound++;
  }
}

console.log(
  `\n📦  Backend modules listos: ${copied} copiados, ` +
  `${already} ya presentes, ${notFound} no encontrados en root.`
);
