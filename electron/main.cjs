const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

const isDev = !app.isPackaged;
let mainWindow;
let serverProcess;

function startNextServer() {
  return new Promise((resolve) => {
    if (isDev) {
      // Dev mode: assume next dev is already running
      resolve('http://localhost:3000');
      return;
    }

    // Production: start next server from built output
    const nextBin = path.join(__dirname, '..', 'node_modules', '.bin', 'next.cmd');
    const nextDir = path.join(__dirname, '..');
    
    serverProcess = spawn(nextBin, ['start', '--port', '3456'], {
      cwd: nextDir,
      env: { ...process.env, NODE_ENV: 'production' },
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true,
    });

    serverProcess.stdout.on('data', (data) => {
      const msg = data.toString();
      console.log('[Next.js]', msg);
      if (msg.includes('Ready') || msg.includes('started') || msg.includes('3456')) {
        setTimeout(() => resolve('http://localhost:3456'), 500);
      }
    });

    serverProcess.stderr.on('data', (data) => {
      console.error('[Next.js Error]', data.toString());
    });

    // Fallback: resolve after 5 seconds anyway
    setTimeout(() => resolve('http://localhost:3456'), 5000);
  });
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 800,
    minHeight: 600,
    title: 'HordeCraft',
    icon: path.join(__dirname, 'icon.png'),
    autoHideMenuBar: true,
    fullscreen: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // F11 fullscreen toggle
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F11') {
      mainWindow.setFullScreen(!mainWindow.isFullScreen());
      event.preventDefault();
    }
  });

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  // Show loading while server starts
  mainWindow.loadURL('data:text/html,<html><body style="background:#0a0a1a;color:#ff6b35;display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;font-size:24px"><div>HordeCraft yükleniyor...</div></body></html>');

  const serverUrl = await startNextServer();
  mainWindow.loadURL(serverUrl);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Try to init Steam
try {
  require('./steam.cjs');
} catch (e) {
  console.log('Steam integration not available:', e.message);
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (serverProcess) {
    serverProcess.kill();
  }
  app.quit();
});

app.on('before-quit', () => {
  if (serverProcess) {
    serverProcess.kill();
  }
});

app.on('activate', () => {
  if (mainWindow === null) createWindow();
});
