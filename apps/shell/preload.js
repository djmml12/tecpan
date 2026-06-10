const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getBackendUrl: () => ipcRenderer.invoke('get-backend-url'),
  printReceipt: (payload) => ipcRenderer.invoke('print-receipt', payload),
  printReceiptDocument: (payload) => ipcRenderer.invoke('print-receipt-document', payload),
  printEscPos: (payload) => ipcRenderer.invoke('print-escpos', payload),
  saveReceiptPdf: (payload) => ipcRenderer.invoke('save-receipt-pdf', payload),
  saveReportFile: (payload) => ipcRenderer.invoke('save-report-file', payload),
  listPrinters: () => ipcRenderer.invoke('list-printers'),
  focusWindow: () => ipcRenderer.send('focus-main-window'),
  setCloseGuard: (payload) => ipcRenderer.send('set-close-guard', payload),
  onWindowActivated: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('window-activated', listener);
    return () => ipcRenderer.removeListener('window-activated', listener);
  },
});

contextBridge.exposeInMainWorld('setupAPI', {
  getLogoPath:     ()         => ipcRenderer.invoke('setup:get-logo-path'),
  pickDbFile:      ()         => ipcRenderer.invoke('setup:pick-db-file'),
  validateImport:  (srcPath)  => ipcRenderer.invoke('setup:validate-import',  srcPath),
  createDatabase:  ()         => ipcRenderer.invoke('setup:create-database'),
  importDatabase:  (srcPath)  => ipcRenderer.invoke('setup:import-database',  srcPath),
  createAdmin:     (data)     => ipcRenderer.invoke('setup:create-admin',      data),
  completeSetup:   ()         => ipcRenderer.invoke('setup:complete'),
  finishSetup:     ()         => ipcRenderer.invoke('setup:finish'),
});
