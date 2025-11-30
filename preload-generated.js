const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('netflowAPI', {
  // 获取插件列表
  getPlugins: () => ipcRenderer.invoke('get-plugins'),
  // 获取设置信息
  getSettings : () => ipcRenderer.invoke('get-settings'),
  // 保存设置信息
  saveSettings: (newSettings) => ipcRenderer.invoke('save-settings', newSettings),
  // 启动插件
  startPlugin: (pluginName, options) => ipcRenderer.invoke('start-plugin', pluginName, options),
  // 停止插件
  stopPlugin: (pluginName) => ipcRenderer.invoke('stop-plugin', pluginName),
  // 切换插件启用状态
  togglePlugin: (pluginName) => ipcRenderer.invoke('toggle-plugin', pluginName),
  // 弹出插件窗口
  detachPlugin: (pluginName) => ipcRenderer.invoke('detach-plugin', pluginName),
  // 关闭弹出窗口
  closeDetachedWindow: (windowId) => ipcRenderer.invoke('close-detached-window', windowId),
  // 重启应用
  restartApp: () => ipcRenderer.invoke('restart-app'),
  
  // 窗口控制
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  maximizeWindow: () => ipcRenderer.send('window-maximize'),
  closeWindow: () => ipcRenderer.send('window-close'),
});

// --- Plugin Preloads ---

// Plugin: python-sniffer
(function() {
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pythonSniffer', {
  onPacketBatch: (callback) => {
    ipcRenderer.removeAllListeners('python-sniffer:packet-data-batch');
    ipcRenderer.on('python-sniffer:packet-data-batch', (event, packets) => {
      callback(packets);
    });
  }
});

})();
