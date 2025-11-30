const { ipcMain, app } = require('electron');
const path = require('path');
const fs = require('fs');
const { saveSettings, plugins, pluginsDir, settings } = require('./settings-loader');

const isPackaged = app.isPackaged;

// 存储运行中的子进程
let runningProcesses = {};

// 获取插件 UI 内容的辅助函数
function getPluginUiContent(plugin) {
  if (!plugin.ui) return null;
  const uiPath = path.join(pluginsDir, plugin.dir, plugin.ui);
  if (fs.existsSync(uiPath)) {
    return fs.readFileSync(uiPath, 'utf-8');
  } else {
    console.error(`UI file not found for plugin ${plugin.name}: ${uiPath}`);
  }
  return null;
}

// 获取插件 Renderer JS 内容的辅助函数
function getPluginRenderJS(plugin) {
  if (!plugin.renderer) return null;
  const jsPath = path.join(pluginsDir, plugin.dir, plugin.renderer);
  if (fs.existsSync(jsPath)) {
    // 直接返回内容，前端使用 Blob 加载，避免 Base64 中文乱码问题
    return fs.readFileSync(jsPath, 'utf-8');
  } else {
    console.error(`Renderer JS file not found for plugin ${plugin.name}: ${jsPath}`);
  }
  return null;
}

// 监听渲染进程请求插件列表
ipcMain.handle('get-plugins', async () => {
  console.log('Handling get-plugins request');
  const result = plugins.map(p => {
    const enabled = settings.enabledPlugins.includes(p.name);
    return { 
      ...p, 
      enabled,
      uiContent: enabled ? getPluginUiContent(p) : null,
      renderJS: enabled ? getPluginRenderJS(p) : null,
      restartRequired: !!p.preload
    };
  });
  console.log(`Returning ${result.length} plugins`);
  return result;
});

// 核心启动逻辑
async function startPlugin(sender, pluginName, options) {
  const plugin = plugins.find(p => p.name === pluginName);
  if (!plugin) return { error: 'Plugin not found' };

  if (runningProcesses[pluginName]) return { error: 'Plugin already running' };

  const pluginDir = path.isAbsolute(settings.pluginsDirectory)
    ? path.join(settings.pluginsDirectory, plugin.dir)
    : path.join(isPackaged ? process.resourcesPath : app.getAppPath(), settings.pluginsDirectory, plugin.dir);
  const pluginEntry = plugin.entry ? path.join(pluginDir, plugin.entry) : null;

  if (pluginEntry) {
    if (!fs.existsSync(pluginEntry)) {
      return { error: `Plugin entry point not found: ${pluginEntry}` };
    }
  }

  try {
    // 清除缓存以支持热重载
    const resolvedPath = require.resolve(pluginEntry);
    delete require.cache[resolvedPath];

    const pluginModule = require(pluginEntry);
    
    const context = {
      sender: sender,
      dir: pluginDir,
      pluginName: pluginName
    };

    const instance = await pluginModule.start(context, options || {});
    runningProcesses[pluginName] = instance;
    
    return { success: true };
  } catch (err) {
    console.error(`Failed to start plugin ${pluginName}:`, err);
    return { error: err.message };
  }
}

// 监听插件启动请求
ipcMain.handle('start-plugin', async (event, pluginName, options) => {
  return startPlugin(event.sender, pluginName, options);
});

// 监听插件停止请求
ipcMain.handle('stop-plugin', async (event, pluginName) => {
  const instance = runningProcesses[pluginName];
  if (!instance) return { error: 'Plugin not running' };

  try {
    if (typeof instance.stop === 'function') {
      await instance.stop();
    } else if (instance.kill) {
      instance.kill();
    }
  } catch (err) {
    console.error(`Error stopping plugin ${pluginName}:`, err);
  }
  
  delete runningProcesses[pluginName];
  return { success: true };
});

// 获取设置信息
ipcMain.handle('get-settings', async () => {
  return settings;
});

// 保存设置信息
ipcMain.handle('save-settings', async (event, newSettings) => {
  saveSettings(newSettings);
  return { success: true };
});

// 监听切换插件启用状态
ipcMain.handle('toggle-plugin', async (event, pluginName) => {
  const index = settings.enabledPlugins.indexOf(pluginName);
  if (index > -1) {
    settings.enabledPlugins.splice(index, 1);
  } else {
    settings.enabledPlugins.push(pluginName);
  }
  saveSettings(settings);
  
  const enabled = settings.enabledPlugins.includes(pluginName);
  const plugin = plugins.find(p => p.name === pluginName);

  if (!plugin) {
    return { error: 'Plugin not found' };
  }
  
  return { 
    enabled,
    uiContent: enabled ? getPluginUiContent(plugin) : null,
    renderJS: enabled ? getPluginRenderJS(plugin) : null,
    restartRequired: enabled && plugin.preload
  };
});

// 监听重启应用请求
ipcMain.handle('restart-app', () => {
  app.relaunch();
  app.exit(0);
});

module.exports = {
  runningProcesses,
  startPlugin
};
