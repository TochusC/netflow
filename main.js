const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { settings, plugins, preloadPath} = require('./utils/settings-loader');
const { startPlugin, runningProcesses} = require('./utils/ipc');

app.disableHardwareAcceleration();

// 动态生成 preload 脚本
console.log('Using preload script:', preloadPath);

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
    },
    autoHideMenuBar: true, // 隐藏菜单栏
    frame: false, // 无边框窗口
    titleBarStyle: 'hidden', // 隐藏标题栏但保留窗口控制（macOS）
  });

  win.loadFile(settings.renderHTML || 'renderer/index.html');
  return win;
}

// 独立窗口管理
const detachedWindows = new Map();

ipcMain.handle('detach-plugin', async (event, pluginName) => {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
    },
    autoHideMenuBar: true,
    frame: false, // 无边框窗口
  });

  win.loadFile('renderer/popout.html', { query: { plugin: pluginName, id: win.id.toString() } });
  
  detachedWindows.set(win.id, win);
  
  win.on('closed', () => {
    detachedWindows.delete(win.id);
  });

  return win.id;
});

ipcMain.handle('close-detached-window', async (event, windowId) => {
    const id = parseInt(windowId);
    const win = BrowserWindow.fromId(id);
    if (win) {
        win.close();
        return true;
    }
    return false;
});

// 窗口控制 IPC
ipcMain.on('window-minimize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.minimize();
});

ipcMain.on('window-maximize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) {
    if (win.isMaximized()) {
      win.unmaximize();
    } else {
      win.maximize();
    }
  }
});

ipcMain.on('window-close', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.close();
});

// Electron 初始化
app.whenReady().then(async () => {
  const win = createWindow();

  // 打印加载的插件列表
  console.log('Loaded plugins:', plugins);
  console.log('Enabled plugins:', settings.enabledPlugins);

  // 启动启用的插件
  for (const pluginName of settings.enabledPlugins) {
    // 直接调用 channel.startPlugin，传入 win.webContents 作为 sender
    const result = await startPlugin(win.webContents, pluginName, {});
    if (result.error) {
      console.error(`Failed to start ${pluginName}: ${result.error}`);
    } else {
      console.log(`Started ${pluginName}`);
    }
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  
  if (process.platform !== 'darwin') {
    // 停止所有运行中的插件进程
    Object.values(runningProcesses).forEach(instance => {
      if (instance && typeof instance.stop === 'function') {
        instance.stop();
      } else if (instance && instance.kill) {
        instance.kill();
      }
    });
    app.quit();
  }
});