const { app, BrowserWindow } = require('electron');
const path = require('path');
const http = require('http');

let mainWindow;
let nextServer;

async function startNextServer() {
  const port = 3456;
  const appPath = app.isPackaged ? app.getAppPath() : path.join(__dirname, '..');
  
  console.log('Starting Next.js from:', appPath);
  console.log('Is packaged:', app.isPackaged);
  
  const next = require(path.join(appPath, 'node_modules', 'next'));
  
  const nextApp = next({
    dev: false,
    dir: appPath,
    port: port,
  });
  
  const handle = nextApp.getRequestHandler();
  await nextApp.prepare();
  
  nextServer = http.createServer((req, res) => {
    handle(req, res);
  });
  
  await new Promise((resolve) => {
    nextServer.listen(port, () => {
      console.log(`Next.js ready on http://localhost:${port}`);
      resolve();
    });
  });
  
  return `http://localhost:${port}`;
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
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F11') {
      mainWindow.setFullScreen(!mainWindow.isFullScreen());
      event.preventDefault();
    }
  });

  // Loading screen
  mainWindow.loadURL('data:text/html,<html><body style="background:%230a0a1a;color:%23ff6b35;display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;font-size:28px;margin:0"><div style="text-align:center"><div style="font-size:48px;font-weight:bold;margin-bottom:16px">HORDECRAFT</div><div>Yükleniyor...</div></div></body></html>');
  mainWindow.show();

  try {
    const serverUrl = await startNextServer();
    mainWindow.loadURL(serverUrl + '/play');
  } catch (e) {
    console.error('Server start failed:', e);
    mainWindow.loadURL('data:text/html,<html><body style="background:%230a0a1a;color:%23ff3366;display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;font-size:16px;margin:0;padding:20px"><div style="text-align:center"><div style="font-size:24px;margin-bottom:16px">Hata</div><pre style="color:%23888;text-align:left;max-width:600px;overflow:auto">' + String(e.stack || e) + '</pre></div></body></html>');
  }

  mainWindow.on('closed', () => { mainWindow = null; });
}

try { require('./steam.cjs'); } catch (e) { console.log('Steam:', e.message); }

app.whenReady().then(createWindow);
app.on('window-all-closed', () => {
  if (nextServer) nextServer.close();
  app.quit();
});
