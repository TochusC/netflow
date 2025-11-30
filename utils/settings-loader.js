const fs = require('fs');
const path = require('path');
const { app } = require('electron');

// 确定配置和插件路径
const isPackaged = app.isPackaged;
const basePath = isPackaged ? process.resourcesPath : app.getAppPath();
const settingsPath = path.join(basePath, "settings.json");

const settings = loadSettings(settingsPath);
const pluginsDir = path.isAbsolute(settings.pluginsDirectory) ? settings.pluginsDirectory : path.join(basePath, settings.pluginsDirectory);
const plugins = loadPlugins(pluginsDir);
const preloadPath = generatePreloadScript();

function loadSettings(settingsPath) {
  if (fs.existsSync(settingsPath)) {
    try {
      return JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    } catch (e) {
      console.error('Error parsing settings.json:', e);
    }
  } else{
    console.error("Failed Load Settings.")
  }
}

function saveSettings(settings) {
  try {
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  } catch (e) {
    console.error('Error saving settings.json:', e);
  }
}

function loadPlugins(pluginsDir) {
  const plugins = [];
  if (fs.existsSync(pluginsDir)) {
    const items = fs.readdirSync(pluginsDir, { withFileTypes: true });
    items.forEach(item => {
      if (item.isDirectory()) {
        const manifestPath = path.join(pluginsDir, item.name, 'plugin.json');
        if (fs.existsSync(manifestPath)) {
          try {
            const info = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
            plugins.push({ ...info, dir: item.name });
          } catch (e) {
            console.error(`Error parsing plugin.json for ${item.name}`, e);
          }
        }
      }
    });
  } else {
    console.error("Not found plugin directory.")
  }
  return plugins;
}

function generatePreloadScript() {
  const basePreloadPath = path.join(isPackaged ? process.resourcesPath : app.getAppPath(), settings.basePreload || 'preload-base.js');
  const outputPath = path.join(isPackaged ? process.resourcesPath : app.getAppPath(), 'preload-generated.js');
  
  let content = '';

  // 1. 读取基础 Preload
  if (fs.existsSync(basePreloadPath)) {
    content += fs.readFileSync(basePreloadPath, 'utf-8') + '\n\n';
  }

  // 2. 注入插件 Preload
  content += '// --- Plugin Preloads ---\n';
  
  settings.enabledPlugins.forEach(pluginName => {
    const plugin = plugins.find(p => p.name === pluginName);
    if (plugin && plugin.preload) {
      const pluginPreloadPath = path.join(pluginsDir, plugin.dir, plugin.preload);
      if (fs.existsSync(pluginPreloadPath)) {
        try {
          const pluginContent = fs.readFileSync(pluginPreloadPath, 'utf-8');
          // 使用 IIFE 包裹以避免变量污染
          content += `\n// Plugin: ${plugin.name}\n(function() {\n${pluginContent}\n})();\n`;
        } catch (e) {
          console.error(`Error reading preload for ${plugin.name}:`, e);
        }
      }
    }
  });

  try {
    fs.writeFileSync(outputPath, content);
    return outputPath;
  } catch (e) {
    console.error('Error writing generated preload:', e);
    return basePreloadPath; // 降级
  }
}

module.exports = {
  loadSettings,
  saveSettings,
  loadPlugins,
  generatePreloadScript,
  plugins,
  pluginsDir,
  settings,
  preloadPath
};
