const params = new URLSearchParams(window.location.search);
const pluginName = params.get('plugin');
const windowId = params.get('id');

document.title = pluginName || 'Plugin';
const dragHandle = document.getElementById('title-text');
if (pluginName) {
    dragHandle.textContent = pluginName;
}

// Window Controls
document.getElementById('min-btn').addEventListener('click', () => window.netflowAPI.minimizeWindow());
document.getElementById('max-btn').addEventListener('click', () => window.netflowAPI.maximizeWindow());
document.getElementById('close-btn').addEventListener('click', () => window.netflowAPI.closeWindow());

// Drag Start - Pass info to dock back
dragHandle.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('application/x-netflow-plugin', JSON.stringify({
        pluginName: pluginName,
        windowId: windowId
    }));
    e.dataTransfer.effectAllowed = 'move';
});

// Initialize Plugin
(async () => {
    if (!pluginName) return;
    
    // Load plugins data
    const plugins = await window.netflowAPI.getPlugins();
    const plugin = plugins.find(p => p.name === pluginName);
    
    if (plugin) {
        const container = document.getElementById('content');
        const uiId = `plugin-${pluginName}-popout`;
        
        // Wrapper
        const wrapper = document.createElement('div');
        wrapper.id = uiId;
        wrapper.className = 'plugin-root';
        
        // Shadow DOM
        if (plugin.uiContent) {
            const shadow = wrapper.attachShadow({ mode: 'open' });
            shadow.innerHTML = plugin.uiContent;
        }
        container.appendChild(wrapper);

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
    }
})();
