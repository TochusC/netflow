// 初始化 DockManager
window.dockManager = new DockManager('dock-container');

// 插件管理 UI 容器
let pluginListContainer = null;

// 创建插件管理界面
function createPluginManager() {
  const container = document.createElement('div');
  container.id = 'plugins';
  container.style.padding = '20px';
  container.style.height = '100%';
  container.style.overflow = 'auto';
  
  container.innerHTML = `
    <h2>插件管理</h2>
    <div id="pluginList"></div>
  `;
  
  pluginListContainer = container.querySelector('#pluginList');
  return container;
}

// 初始化插件管理 Tab
const pluginManagerUI = createPluginManager();
// 默认打开插件管理
window.dockManager.openTab('插件管理', pluginManagerUI);

// 添加控制按钮 - 插件管理
window.dockManager.addControl('插件管理', '插件管理', () => {
  // 简单处理：总是打开一个新的或激活现有的（如果能找到）
  let found = false;
  for (const [id, item] of window.dockManager.items) {
      if (item.title === '插件管理') {
          window.dockManager.activateTab(id);
          found = true;
          break;
      }
  }
  if (!found) {
      window.dockManager.openTab('插件管理', pluginManagerUI);
  }
});

// 添加控制按钮 - 新建面板
window.dockManager.addControl('新建面板', '新建面板', () => {
    showNewPanelDialog();
});

// 添加控制按钮 - 设置
window.dockManager.addControl('设置', '设置', async () => {
    const settings = await window.netflowAPI.getSettings();
    window.settings = settings; // Update global cache
    showSettingsDialog();
});

function showSettingsDialog() {
    const dialog = document.createElement('div');
    dialog.style.cssText = `
        position: fixed; top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0.5); z-index: 9999;
        display: flex; justify-content: center; align-items: center;
    `;
    
    const content = document.createElement('div');
    content.style.cssText = `
        background: var(--bg-color, #252526); padding: 20px; border-radius: 8px;
        border: 1px solid var(--border-color, #3e3e42); width: 600px; height: 500px;
        color: var(--text-color, #cccccc); display: flex; flex-direction: column;
    `;
    
    content.innerHTML = `
        <h3 style="margin-top:0">设置 (settings.json)</h3>
        <textarea id="settings-editor" style="flex: 1; width: 100%; background: #1e1e1e; color: #d4d4d4; border: 1px solid #3e3e42; font-family: monospace; padding: 10px; resize: none;"></textarea>
        <div style="margin-top: 15px; display: flex; justify-content: flex-end; gap: 10px;">
            <button id="save-btn" style="padding: 5px 15px;">保存</button>
            <button id="cancel-btn" style="padding: 5px 15px;">取消</button>
        </div>
    `;
    
    const textarea = content.querySelector('#settings-editor');
    textarea.value = JSON.stringify(window.settings, null, 2);
    
    content.querySelector('#save-btn').onclick = async () => {
        try {
            const newSettings = JSON.parse(textarea.value);
            await window.netflowAPI.saveSettings(newSettings);
            window.settings = newSettings;
            alert('设置已保存，部分更改可能需要重启应用生效。');
            dialog.remove();
        } catch (e) {
            alert('JSON 格式错误: ' + e.message);
        }
    };
    
    content.querySelector('#cancel-btn').onclick = () => dialog.remove();
    dialog.appendChild(content);
    document.body.appendChild(dialog);
}

function showNewPanelDialog() {
    const dialog = document.createElement('div');
    dialog.style.cssText = `
        position: fixed; top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0.5); z-index: 9999;
        display: flex; justify-content: center; align-items: center;
    `;
    
    const content = document.createElement('div');
    content.style.cssText = `
        background: var(--bg-color, #252526); padding: 20px; border-radius: 8px;
        border: 1px solid var(--border-color, #3e3e42); min-width: 300px;
        color: var(--text-color, #cccccc);
    `;
    
    content.innerHTML = `<h3 style="margin-top:0">新建面板</h3><div id="plugin-options"></div><button id="cancel-btn" style="margin-top:15px; padding: 5px 10px;">取消</button>`;
    
    const list = content.querySelector('#plugin-options');
    const enabledPlugins = window.plugins.filter(p => p.enabled);
    
    if (enabledPlugins.length === 0) {
        list.innerHTML = '<p>没有启用的插件</p>';
    } else {
        enabledPlugins.forEach(p => {
            const btn = document.createElement('button');
            btn.textContent = p.name;
            btn.style.cssText = 'display:block; width:100%; margin: 5px 0; padding: 8px; cursor: pointer;';
            btn.onclick = () => {
                createPluginInstance(p.name, true);
                dialog.remove();
            };
            list.appendChild(btn);
        });
    }
    
    content.querySelector('#cancel-btn').onclick = () => dialog.remove();
    dialog.appendChild(content);
    document.body.appendChild(dialog);
}

// 异步初始化数据
async function initData() {
  window.plugins = await window.netflowAPI.getPlugins();
  window.settings = await window.netflowAPI.getSettings();
  console.log('Plugins loaded:', window.plugins);
}

// 渲染插件列表
function renderPluginList() {
  if (!pluginListContainer) return;
  pluginListContainer.innerHTML = '';
  
  const sortedPlugins = [...window.plugins].sort((a, b) => (b.enabled ? 1 : 0) - (a.enabled ? 1 : 0));
  
  sortedPlugins.forEach(plugin => {
    const div = document.createElement('div');
    div.className = 'plugin-item';
    div.style.marginBottom = '10px';
    
    div.innerHTML = `
      <span style="font-weight:bold">${plugin.name}</span> <span style="opacity:0.7">(${plugin.type})</span>
      <label style="margin-left:10px">
        <input type="checkbox" ${plugin.enabled ? 'checked' : ''} onchange="togglePlugin('${plugin.name}')">
        启用
      </label>
    `;
    pluginListContainer.appendChild(div);
  });
}

// 创建插件实例
function createPluginInstance(pluginName, activate = true) {
    const plugin = window.plugins.find(p => p.name === pluginName);
    if (!plugin || !plugin.enabled) return;

    const instanceId = Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    const uiId = `plugin-${plugin.name}-${instanceId}`;
    
    // Wrapper
    const wrapper = document.createElement('div');
    wrapper.id = uiId;
    wrapper.className = 'plugin-root';
    wrapper.style.height = '100%';
    wrapper.dataset.pluginName = pluginName;
    
    // Shadow DOM
    if (plugin.uiContent) {
        const shadow = wrapper.attachShadow({ mode: 'open' });
        shadow.innerHTML = plugin.uiContent;
    }

    // Script
    if (plugin.renderJS) {
        const scriptId = `script-${uiId}`;
        const script = document.createElement('script');
        script.id = scriptId;
        
        const wrappedCode = `
          (function(scopeId) {
            const host = window.document.getElementById(scopeId);
            if (!host || !host.shadowRoot) return;
            const shadowRoot = host.shadowRoot;
            const document = new Proxy(window.document, {
              get: (target, prop) => {
                if (prop === 'getElementById') return (id) => shadowRoot.getElementById(id);
                if (prop === 'querySelector') return (selector) => shadowRoot.querySelector(selector);
                if (prop === 'querySelectorAll') return (selector) => shadowRoot.querySelectorAll(selector);
                const val = target[prop];
                return typeof val === 'function' ? val.bind(target) : val;
              }
            });
            try {
              ${plugin.renderJS}
            } catch (e) { console.error('Plugin Error:', e); }
          })('${uiId}');
        `;
        
        const blob = new Blob([wrappedCode], { type: 'application/javascript' });
        script.src = URL.createObjectURL(blob);
        document.body.appendChild(script);
    }

    window.dockManager.openTab(plugin.name, wrapper, { activate });
}
window.createPluginInstance = createPluginInstance;

// 切换插件启用状态
async function togglePlugin(pluginName) {
  const result = await window.netflowAPI.togglePlugin(pluginName);
  
  const plugin = window.plugins.find(p => p.name === pluginName);
  if (plugin) {
    plugin.enabled = result.enabled;
    plugin.uiContent = result.uiContent;
    plugin.renderJS = result.renderJS;
  }

  renderPluginList();

  if (result.enabled) {
      // 启用时，不自动跳转，但创建一个实例
      createPluginInstance(pluginName, false);
  } else {
      // 禁用时，关闭所有该插件的实例
      const tabsToClose = [];
      for (const [tabId, item] of window.dockManager.items) {
          if (item.content.dataset && item.content.dataset.pluginName === pluginName) {
              tabsToClose.push(tabId);
          }
      }
      tabsToClose.forEach(id => window.dockManager.closeTab(id));
  }

  if (result.enabled && result.restartRequired) {
    setTimeout(async () => {
      if (confirm(`插件 "${pluginName}" 需要重启应用才能生效。\n是否现在重启？`)) {
        await window.netflowAPI.restartApp();
      }
    }, 100);
  }
}

// 重启应用
async function restartApp() {
  if (confirm('确定要重启应用吗？这将中断所有当前的抓包任务。')) {
    await window.netflowAPI.restartApp();
  }
}

window.togglePlugin = togglePlugin;
window.restartApp = restartApp;

// Window Controls
function initWindowControls() {
  const minBtn = document.getElementById('min-btn');
  const maxBtn = document.getElementById('max-btn');
  const closeBtn = document.getElementById('close-btn');

  if (minBtn) minBtn.addEventListener('click', () => window.netflowAPI.minimizeWindow());
  if (maxBtn) maxBtn.addEventListener('click', () => window.netflowAPI.maximizeWindow());
  if (closeBtn) closeBtn.addEventListener('click', () => window.netflowAPI.closeWindow());
}

// 初始化
(async () => {
  initWindowControls();
  await initData();
  renderPluginList();
  
  // 初始加载：为每个启用的插件创建一个实例
  window.plugins.forEach(p => {
      if (p.enabled) {
          createPluginInstance(p.name, false);
      }
  });
})();

