const { app, BrowserWindow, ipcMain, Menu, dialog } = require('electron');
const net      = require('net');
const path     = require('path');
const fs       = require('fs');
const fsP      = require('fs/promises');
const crypto   = require('crypto');
const { pathToFileURL } = require('url');

let mainWindow    = null;
let splashWindow  = null;
let setupWindow   = null;
let backendStarted = false;
let backendReady   = false;
let mainWindowReady = false;
let chosenPort    = 3000;
let closeGuard = { active: false, message: '' };

// Puertos candidatos en orden de preferencia.
// Se evitan rangos comunes de Hyper-V/WSL2, Docker y herramientas de desarrollo.
const PORT_CANDIDATES = [3000, 3001, 3002, 3003, 3010, 3100, 17321, 17322, 17323];

const devServerUrl = process.env.POS_SHELL_URL || 'http://127.0.0.1:5173';

const singleInstanceLock = app.requestSingleInstanceLock();
if (!singleInstanceLock) app.quit();

app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');

app.setPath('userData', path.join(app.getPath('appData'), 'pos-tablet'));

// ── Helpers de rutas ──────────────────────────────────────────

function getBackendNodeModules() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'backend', 'node_modules')
    : path.join(__dirname, '..', 'backend', 'node_modules');
}

function getBackendSrc() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'backend', 'src')
    : path.join(__dirname, '..', 'backend', 'src');
}

// ── Inicializar variables de entorno del backend ──────────────

function initBackendEnv() {
  const userData = app.getPath('userData');
  fs.mkdirSync(userData, { recursive: true });

  process.env.ELECTRON_USER_DATA   = userData;
  process.env.ELECTRON_IS_PACKAGED = String(app.isPackaged);
  process.env.SQLITE_PATH          = path.join(userData, 'fenix.sqlite');

  if (app.isPackaged) {
    const cfgPath = path.join(userData, 'app-config.json');
    let cfg = {};
    if (fs.existsSync(cfgPath)) {
      try { cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8')); } catch {}
    }
    if (!cfg.jwtSecret) {
      cfg.jwtSecret = crypto.randomBytes(48).toString('hex');
      fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
    }
    process.env.JWT_SECRET = cfg.jwtSecret;
    process.env.PORT = String(cfg.port || 3000);
    process.env.HOST = cfg.host || '0.0.0.0';
  }

  process.env.NODE_PATH = getBackendNodeModules();
  require('module').Module._initPaths();
}

// ── Detección de primer arranque ──────────────────────────────

function isSetupComplete() {
  const lockPath = path.join(app.getPath('userData'), 'setup-completed.json');
  return fs.existsSync(lockPath);
}

// ── Foco de la ventana principal ──────────────────────────────

function restoreMainWindowFocus() {
  const win = mainWindow || BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  win.webContents.focus();
  win.webContents.send('window-activated');
  setTimeout(() => {
    if (!win.isDestroyed()) {
      win.focus();
      win.webContents.focus();
      win.webContents.send('window-activated');
    }
  }, 150);
}

// ── Ventana de splash ─────────────────────────────────────────

function createSplashWindow() {
  if (splashWindow && !splashWindow.isDestroyed()) return splashWindow;

  const win = new BrowserWindow({
    width: 420,
    height: 260,
    frame: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    movable: true,
    show: false,
    backgroundColor: '#0f4c5c',
    alwaysOnTop: true,
    center: true,
    webPreferences: { sandbox: true },
  });

  splashWindow = win;

  const splashHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>POS Tablet</title>
  <style>html,body{margin:0;width:100%;height:100%;overflow:hidden;font-family:"Segoe UI",sans-serif;
  background:linear-gradient(160deg,#0f4c5c 0%,#1d6f89 100%);color:#fff}
  body{display:flex;align-items:center;justify-content:center}
  .shell{width:100%;height:100%;box-sizing:border-box;padding:28px;display:flex;flex-direction:column;
  align-items:center;justify-content:center;gap:16px;text-align:center}
  .brand{font-size:32px;font-weight:800;letter-spacing:1px}
  .subtitle{font-size:15px;color:rgba(255,255,255,.88)}
  .loader{width:220px;height:10px;border-radius:999px;background:rgba(255,255,255,.18);overflow:hidden}
  .loader::before{content:"";display:block;width:40%;height:100%;border-radius:inherit;
  background:linear-gradient(90deg,#fbbf24 0%,#fff 100%);animation:travel 1.2s ease-in-out infinite}
  .hint{font-size:13px;color:rgba(255,255,255,.72)}
  @keyframes travel{0%{transform:translateX(-120%)}100%{transform:translateX(320%)}}</style>
  </head><body><div class="shell"><div class="brand">POS Tablet</div>
  <div class="subtitle">Iniciando sistema...</div><div class="loader"></div>
  <div class="hint">Cargando base de datos y servicios</div></div></body></html>`;

  win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(splashHtml)}`);
  win.show();
  win.on('closed', () => { if (splashWindow === win) splashWindow = null; });
  return win;
}

// ── Ventana principal ─────────────────────────────────────────

function showMainWindowWhenReady() {
  if (!backendReady || !mainWindowReady || !mainWindow || mainWindow.isDestroyed()) return;
  if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close();
  mainWindow.show();
  mainWindow.focus();
}

function createWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) return mainWindow;

  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    useContentSize: true,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
      backgroundThrottling: false,
      zoomFactor: 1,
    },
  });

  mainWindow = win;

  if (app.isPackaged) {
    win.loadFile(path.join(process.resourcesPath, 'frontend', 'index.html'));
  } else {
    win.loadURL(devServerUrl);
  }

  win.once('ready-to-show', () => {
    if (!win.isDestroyed()) {
      win.maximize();
      mainWindowReady = true;
      showMainWindowWhenReady();
    }
  });
  win.on('closed', () => {
    if (mainWindow === win) { mainWindow = null; mainWindowReady = false; }
  });
  win.on('close', (event) => {
    if (!closeGuard.active) return;
    event.preventDefault();
    dialog.showMessageBox(win, {
      type: 'info',
      title: 'Fénix POS',
      message: closeGuard.message || 'Espera a que termine la operación en curso antes de cerrar el POS.',
      buttons: ['Entendido'],
      noLink: true,
    }).catch(() => {});
  });

  const notifyActive = () => {
    if (win.isDestroyed()) return;
    win.webContents.focus();
    win.webContents.send('window-activated');
    setTimeout(() => {
      if (!win.isDestroyed()) {
        win.webContents.focus();
        win.webContents.send('window-activated');
      }
    }, 120);
  };

  win.on('focus', notifyActive);
  win.on('show',  notifyActive);
  win.webContents.on('did-finish-load', notifyActive);
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('render-process-gone', (_e, details) => {
    console.error('Renderer gone:', details);
    if (!win.isDestroyed()) setTimeout(() => { if (!win.isDestroyed()) win.reload(); }, 800);
  });
  win.on('unresponsive', () => { if (!win.isDestroyed()) win.webContents.reloadIgnoringCache(); });

  return win;
}

// ── Ventana de setup ──────────────────────────────────────────

function createSetupWindow() {
  if (setupWindow && !setupWindow.isDestroyed()) return setupWindow;

  const win = new BrowserWindow({
    width: 960,
    height: 640,
    minWidth: 800,
    minHeight: 560,
    center: true,
    show: false,
    autoHideMenuBar: true,
    resizable: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  setupWindow = win;
  win.loadFile(path.join(__dirname, 'setup.html'));
  win.once('ready-to-show', () => { if (!win.isDestroyed()) win.show(); });
  win.on('closed', () => { if (setupWindow === win) setupWindow = null; });
  return win;
}

// ── Backend ───────────────────────────────────────────────────

// Prueba si un puerto está libre intentando bindear brevemente.
function probePort(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true)));
    server.listen(port, '127.0.0.1');
  });
}

async function findAvailablePort(savedPort) {
  const candidates = savedPort && !PORT_CANDIDATES.includes(savedPort)
    ? [savedPort, ...PORT_CANDIDATES]
    : savedPort
      ? [savedPort, ...PORT_CANDIDATES.filter(p => p !== savedPort)]
      : PORT_CANDIDATES;

  for (const port of candidates) {
    if (await probePort(port)) return port;
  }
  return null;
}

async function waitForPort(port, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const ok = await new Promise((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(500);
      socket.once('connect', () => { socket.destroy(); resolve(true); });
      socket.once('error',   () => { socket.destroy(); resolve(false); });
      socket.once('timeout', () => { socket.destroy(); resolve(false); });
      socket.connect(port, '127.0.0.1');
    });
    if (ok) return;
    await new Promise(r => setTimeout(r, 50));
  }
  throw new Error(
    `El backend no respondió en el puerto ${port}.\n\n` +
    `Posible causa: otra instancia del sistema (o el servidor de desarrollo) ` +
    `ya está usando ese puerto.\n\nCierra todas las terminales y otras instancias y vuelve a abrir.`
  );
}

async function startBackend() {
  if (backendStarted) return;
  backendStarted = true;

  // Encontrar un puerto disponible antes de arrancar el backend.
  const savedPort = Number(process.env.PORT) || 3000;
  const port = await findAvailablePort(savedPort);

  if (!port) {
    throw new Error(
      'No se encontró ningún puerto disponible en el rango configurado.\n\n' +
      'Cierra Docker, terminales con "npm run dev", WSL y otras aplicaciones ' +
      'que puedan estar usando los puertos 3000-3003 / 3010 / 3100 / 17321-17323, ' +
      'y vuelve a abrir Fénix POS.'
    );
  }

  // Si el puerto cambió, persistir en app-config.json para que las tablets
  // en red no pierdan la URL entre reinicios.
  if (port !== savedPort && app.isPackaged) {
    const cfgPath = path.join(app.getPath('userData'), 'app-config.json');
    try {
      let cfg = {};
      if (fs.existsSync(cfgPath)) {
        try { cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8')); } catch {}
      }
      cfg.port = port;
      fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
    } catch {}
  }

  process.env.PORT = String(port);
  chosenPort = port;

  const backendPath = path.join(getBackendSrc(), 'server.js');
  await import(pathToFileURL(backendPath).href);

  await waitForPort(port, 10000);

  backendReady = true;
  showMainWindowWhenReady();
}

// ── Ventana de recibos ────────────────────────────────────────

async function createReceiptWindow(payload) {
  const paperWidthMm   = Number(payload?.paperWidthMm   || 58);
  const receiptHeightMm = Number(payload?.receiptHeightMm || 180);
  const paperWidthPx   = Math.max(320, Math.ceil(paperWidthMm   * 3.78) + 40);
  const receiptHeightPx = Math.max(480, Math.ceil(receiptHeightMm * 3.78) + 40);

  const win = new BrowserWindow({
    show: false,
    width: paperWidthPx,
    height: receiptHeightPx,
    autoHideMenuBar: true,
    webPreferences: { sandbox: true },
  });

  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(payload.html || '')}`);
  return win;
}

// ── IPC: Impresión ────────────────────────────────────────────

ipcMain.handle('print-receipt', async (_, payload) => {
  const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error('No hay una ventana activa para imprimir');
  return new Promise((resolve, reject) => {
    win.webContents.print(
      { silent: true, printBackground: true, deviceName: payload?.printerName || undefined },
      (success, reason) => { success ? resolve(true) : reject(new Error(reason || 'Error al imprimir')); }
    );
  });
});

ipcMain.handle('print-receipt-document', async (_, payload) => {
  const receiptWin = await createReceiptWindow(payload);
  return new Promise((resolve, reject) => {
    receiptWin.webContents.print(
      {
        silent: true,
        printBackground: true,
        deviceName: payload?.printerName || undefined,
        margins: { marginType: 'none' },
        pageSize: {
          width:  Math.round(Number(payload?.paperWidthMm   || 58)  * 1000),
          height: Math.round(Number(payload?.receiptHeightMm || 180) * 1000),
        },
      },
      (success, reason) => {
        receiptWin.close();
        restoreMainWindowFocus();
        success ? resolve(true) : reject(new Error(reason || 'Error al imprimir recibo'));
      }
    );
  });
});

ipcMain.handle('print-escpos', async (_, payload) => {
  const host  = String(payload?.host  || '').trim();
  const port  = Number(payload?.port  || 9100);
  const bytes = Array.isArray(payload?.bytes) ? payload.bytes : [];

  if (!host)                               throw new Error('Configura la IP de la impresora ESC/POS');
  if (!Number.isFinite(port) || port <= 0) throw new Error('Puerto ESC/POS no válido');
  if (!bytes.length)                       throw new Error('No hay contenido para imprimir');

  await new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let settled  = false;
    const finish = (err) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      err ? reject(err) : resolve(true);
    };
    socket.setTimeout(5000);
    socket.once('error',   finish);
    socket.once('timeout', () => finish(new Error('Tiempo de espera agotado con impresora ESC/POS')));
    socket.connect(port, host, () => {
      socket.write(Buffer.from(bytes), (err) => { err ? finish(err) : socket.end(() => finish()); });
    });
  });

  restoreMainWindowFocus();
  return true;
});

ipcMain.handle('save-report-file', async (_, { bytes, defaultName, ext }) => {
  const filters = ext === 'pdf'
    ? [{ name: 'PDF', extensions: ['pdf'] }]
    : [{ name: 'Excel', extensions: ['xlsx'] }];
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Guardar reporte',
    defaultPath: path.join(app.getPath('downloads'), defaultName),
    filters,
  });
  if (canceled || !filePath) return { canceled: true };
  await fsP.writeFile(filePath, Buffer.from(bytes));
  return { canceled: false, filePath };
});

ipcMain.handle('save-receipt-pdf', async (_, payload) => {
  const receiptWin = await createReceiptWindow(payload);
  try {
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Guardar recibo PDF',
      defaultPath: path.join(app.getPath('downloads'), payload?.fileName || 'recibo.pdf'),
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (canceled || !filePath) { receiptWin.close(); restoreMainWindowFocus(); return { canceled: true }; }
    const pdfBuffer = await receiptWin.webContents.printToPDF({
      printBackground: true, preferCSSPageSize: true,
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
    });
    await fsP.writeFile(filePath, pdfBuffer);
    receiptWin.close();
    restoreMainWindowFocus();
    return { canceled: false, filePath };
  } catch (err) {
    receiptWin.close();
    restoreMainWindowFocus();
    throw err;
  }
});

ipcMain.handle('list-printers', async () => {
  const win = mainWindow || BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
  if (!win || win.isDestroyed()) return [];
  const printers = await win.webContents.getPrintersAsync();
  return printers.map((p) => ({
    name:        p.name,
    displayName: p.displayName || p.name,
    description: p.description || '',
    isDefault:   Boolean(p.isDefault),
    status:      Number(p.status || 0),
  }));
});

ipcMain.on('focus-main-window', () => restoreMainWindowFocus());
ipcMain.on('set-close-guard', (_event, payload = {}) => {
  closeGuard = {
    active: Boolean(payload.active),
    message: String(payload.message || ''),
  };
});

// ── IPC: Setup ────────────────────────────────────────────────

ipcMain.handle('get-backend-url', () => {
  return `http://127.0.0.1:${chosenPort}`;
});

ipcMain.handle('setup:get-logo-path', () => {
  const logoPath = app.isPackaged
    ? path.join(process.resourcesPath, 'frontend', 'logo.png')
    : path.join(__dirname, '..', 'pos-tablet', 'public', 'logo.png');
  return fs.existsSync(logoPath) ? pathToFileURL(logoPath).href : null;
});

ipcMain.handle('setup:pick-db-file', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: 'Seleccionar base de datos Fénix',
    filters: [{ name: 'Base de datos SQLite', extensions: ['sqlite', 'db'] }],
    properties: ['openFile'],
  });
  return canceled ? null : filePaths[0];
});

ipcMain.handle('setup:validate-import', async (_, srcPath) => {
  const Database = require(path.join(getBackendNodeModules(), 'better-sqlite3'));
  let db;
  try {
    db = new Database(srcPath, { readonly: true });
    const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all().map(r => r.name);
    const required = ['users', 'roles', 'products', 'settings'];
    const missing  = required.filter(t => !tables.includes(t));
    if (missing.length > 1) {
      throw new Error(`El archivo no parece ser una base de datos Fénix válida`);
    }
    const { n } = db.prepare(
      `SELECT COUNT(*) as n FROM users u JOIN roles r ON u.role_id = r.id WHERE r.name = 'admin' AND u.is_active = 1`
    ).get();
    return { hasAdmin: n > 0 };
  } finally {
    if (db) db.close();
  }
});

ipcMain.handle('setup:create-database', async () => {
  const { initDBSchema } = await import(
    pathToFileURL(path.join(getBackendSrc(), 'config', 'db.init.js')).href
  );
  await initDBSchema();
});

ipcMain.handle('setup:import-database', async (_, srcPath) => {
  const userData = app.getPath('userData');
  const destPath = path.join(userData, 'fenix.sqlite');
  fs.mkdirSync(userData, { recursive: true });
  fs.copyFileSync(srcPath, destPath);

  const { initDBSchema } = await import(
    pathToFileURL(path.join(getBackendSrc(), 'config', 'db.init.js')).href
  );
  await initDBSchema();
});

ipcMain.handle('setup:create-admin', async (_, { username, password }) => {
  const bcryptjs = require(path.join(getBackendNodeModules(), 'bcryptjs'));
  const hash = await bcryptjs.hash(password, 12);

  const { default: db } = await import(
    pathToFileURL(path.join(getBackendSrc(), 'config', 'db.js')).href
  );
  const { rows } = await db.query(`SELECT id FROM roles WHERE name = ?`, ['admin']);
  const roleId = rows[0]?.id ?? 1;
  await db.query(
    `INSERT INTO users (username, password, role_id) VALUES (?, ?, ?)
     ON CONFLICT(username) DO UPDATE SET password = excluded.password, role_id = excluded.role_id`,
    [username, hash, roleId]
  );
});

ipcMain.handle('setup:complete', async () => {
  const lockPath = path.join(app.getPath('userData'), 'setup-completed.json');
  fs.writeFileSync(lockPath, JSON.stringify({
    version:     '2.0',
    completedAt: new Date().toISOString(),
  }));
});

ipcMain.handle('setup:finish', async () => {
  if (setupWindow && !setupWindow.isDestroyed()) setupWindow.close();
  createSplashWindow();
  createWindow();
  try {
    await startBackend();
  } catch (err) {
    console.error('Error al iniciar backend tras setup:', err);
    if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close();
    if (mainWindow  && !mainWindow.isDestroyed())   mainWindow.close();
    dialog.showErrorBox('Fénix POS', `No se pudo iniciar la aplicación.\n\n${err.message || err}`);
    app.quit();
  }
});

// ── Arranque ──────────────────────────────────────────────────

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);

  if (!isSetupComplete()) {
    initBackendEnv();
    createSetupWindow();
    return;
  }

  createSplashWindow();
  initBackendEnv();
  createWindow();
  try {
    await startBackend();
  } catch (err) {
    console.error('Error al iniciar POS Tablet:', err);
    if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close();
    if (mainWindow   && !mainWindow.isDestroyed())   mainWindow.close();
    dialog.showErrorBox('POS Tablet', `No se pudo iniciar la aplicación.\n\n${err.message || err}`);
    app.quit();
  }

  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('second-instance', () => {
  const win = mainWindow || BrowserWindow.getAllWindows()[0];
  if (!win) { createWindow(); return; }
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
