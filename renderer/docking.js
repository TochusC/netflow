class DockNode {
  constructor(parent = null) {
    this.parent = parent;
    this.element = document.createElement('div');
    this.element.className = 'dock-node';
  }
  
  remove() {
    if (this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
  }
}

class DockSplit extends DockNode {
  constructor(orientation = 'horizontal', parent = null) {
    super(parent);
    this.orientation = orientation;
    this.element.classList.add('dock-split', orientation);
    this.children = [];
  }

  addChild(child) {
    this.children.push(child);
    child.parent = this;
    this.element.appendChild(child.element);
  }

  replaceChild(oldChild, newChild) {
    const index = this.children.indexOf(oldChild);
    if (index !== -1) {
      this.children[index] = newChild;
      newChild.parent = this;
      this.element.replaceChild(newChild.element, oldChild.element);
    }
  }
  
  removeChild(child) {
    const index = this.children.indexOf(child);
    if (index !== -1) {
      this.children.splice(index, 1);
      child.remove();
      // If only one child remains, collapse this split
      if (this.children.length === 1 && this.parent) {
        this.parent.replaceChild(this, this.children[0]);
      }
    }
  }
}

class DockPanel extends DockNode {
  constructor(manager, parent = null) {
    super(parent);
    this.manager = manager;
    this.element.classList.add('dock-panel');
    this.tabs = new Map(); // tabId -> { tab, content, title }
    this.activeTabId = null;

    // Header
    this.header = document.createElement('div');
    this.header.className = 'dock-panel-header';
    this.element.appendChild(this.header);

    // Content
    this.contentContainer = document.createElement('div');
    this.contentContainer.className = 'dock-panel-content';
    this.element.appendChild(this.contentContainer);

    // Drop Overlay
    this.dropOverlay = document.createElement('div');
    this.dropOverlay.className = 'drop-overlay';
    this.dropOverlay.innerHTML = '<div class="drop-indicator"></div>';
    this.contentContainer.appendChild(this.dropOverlay);
  }

  addTab(tabId, title, content, activate = true) {
    if (this.tabs.has(tabId)) return;

    const tab = document.createElement('div');
    tab.className = 'tab';
    tab.innerHTML = `
      <span class="tab-title">${title}</span>
      <span class="tab-close">×</span>
    `;
    
    tab.addEventListener('mousedown', (e) => this.manager.onTabMouseDown(e, tabId, this));
    tab.querySelector('.tab-close').addEventListener('click', (e) => {
      e.stopPropagation();
      this.manager.closeTab(tabId);
    });

    this.header.appendChild(tab);
    this.contentContainer.appendChild(content);
    content.classList.add('plugin-content');

    this.tabs.set(tabId, { tab, content, title });

    if (activate || !this.activeTabId) {
      this.activate(tabId);
    }
  }

  removeTab(tabId) {
    const item = this.tabs.get(tabId);
    if (!item) return;

    item.tab.remove();
    // Don't remove content element, just detach it, as it might be moved
    if (item.content.parentNode === this.contentContainer) {
      this.contentContainer.removeChild(item.content);
    }
    
    this.tabs.delete(tabId);

    if (this.activeTabId === tabId) {
      const first = this.tabs.keys().next().value;
      if (first) this.activate(first);
      else this.activeTabId = null;
    }

    if (this.tabs.size === 0 && this.parent) {
       this.manager.removePanel(this);
    }
  }

  activate(tabId) {
    if (!this.tabs.has(tabId)) return;
    
    this.tabs.forEach(v => {
      v.tab.classList.remove('active');
      v.content.classList.remove('active');
    });

    const item = this.tabs.get(tabId);
    item.tab.classList.add('active');
    item.content.classList.add('active');
    this.activeTabId = tabId;
    this.manager.activePanel = this;
  }
}

class DockManager {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.container.innerHTML = ''; // Clear existing

    // Global Header
    this.header = document.createElement('div');
    this.header.id = 'dock-header';
    // Left aligned controls, then spacer
    this.header.innerHTML = '<div class="tab-controls"></div><div class="spacer"></div>';
    this.container.appendChild(this.header);
    this.controls = this.header.querySelector('.tab-controls');

    // Root Container for Nodes
    this.rootContainer = document.createElement('div');
    this.rootContainer.style.flex = '1';
    this.rootContainer.style.position = 'relative';
    this.rootContainer.style.display = 'flex';
    this.container.appendChild(this.rootContainer);

    this.root = new DockPanel(this);
    this.rootContainer.appendChild(this.root.element);
    
    this.activePanel = this.root;
    this.items = new Map(); // tabId -> { tabId, title, content, panel, floatingWindow, mode: 'dock'|'float' }
    this.dragState = null;
    this.tabIdCounter = 0;

    document.addEventListener('mousemove', this.onMouseMove.bind(this));
    document.addEventListener('mouseup', this.onMouseUp.bind(this));
    
    // External Drag & Drop (from detached windows)
    document.addEventListener('dragover', this.onDragOverExternal.bind(this));
    document.addEventListener('drop', this.onDropExternal.bind(this));
  }

  addControl(text, title, callback) {
    const btn = document.createElement('div');
    btn.className = 'control-btn';
    btn.innerHTML = text;
    btn.title = title;
    btn.addEventListener('click', callback);
    this.controls.appendChild(btn);
  }

  openTab(title, content, options = { activate: true }) {
    const tabId = 'tab-' + (++this.tabIdCounter);

    // Default to active panel or root
    let targetPanel = this.activePanel;
    if (!targetPanel || !targetPanel.element.isConnected) {
      targetPanel = this.findFirstPanel(this.root);
    }
    if (!targetPanel) {
        this.root = new DockPanel(this);
        this.rootContainer.appendChild(this.root.element);
        targetPanel = this.root;
    }

    targetPanel.addTab(tabId, title, content, options.activate);
    this.items.set(tabId, { tabId, title, content, panel: targetPanel, mode: 'dock' });
    return tabId;
  }

  closeTab(tabId) {
    const item = this.items.get(tabId);
    if (!item) return;

    if (item.mode === 'dock') {
      item.panel.removeTab(tabId);
    } else {
      item.floatingWindow.remove();
    }
    item.content.remove(); // Destroy content
    this.items.delete(tabId);
  }

  activateTab(tabId) {
    const item = this.items.get(tabId);
    if (!item) return;
    if (item.mode === 'dock') {
      item.panel.activate(tabId);
    } else {
      // Bring floating to front
    }
  }

  findFirstPanel(node) {
    if (node instanceof DockPanel) return node;
    if (node instanceof DockSplit) {
      return this.findFirstPanel(node.children[0]);
    }
    return null;
  }

  removePanel(panel) {
      if (panel === this.root) return; // Don't remove root
      if (panel.parent) {
          panel.parent.removeChild(panel);
      }
  }

  async floatPlugin(tabId) {
    const item = this.items.get(tabId);
    if (!item) return;

    const pluginName = item.title;
    this.closeTab(tabId);
    await window.netflowAPI.detachPlugin(pluginName);
  }

  // --- Drag & Drop ---

  onTabMouseDown(e, tabId, panel) {
    if (e.button !== 0) return;
    e.preventDefault();
    panel.activate(tabId);
    
    this.dragState = {
      type: 'tab',
      tabId,
      sourcePanel: panel,
      startX: e.clientX,
      startY: e.clientY,
      isDragging: false
    };
  }

  onDragOverExternal(e) {
      e.preventDefault();
      if (!this.dragState) {
          this.dragState = { type: 'external', isDragging: true };
      }
      this.handleDragOver(e);
  }

  async onDropExternal(e) {
      e.preventDefault();
      const data = e.dataTransfer.getData('application/x-netflow-plugin');
      if (!data) return;
      
      try {
          const { pluginName, windowId } = JSON.parse(data);
          if (window.createPluginInstance) {
              window.createPluginInstance(pluginName, true);
          }
          if (windowId) {
              await window.netflowAPI.closeDetachedWindow(windowId);
          }
          document.querySelectorAll('.drop-overlay').forEach(el => el.classList.remove('active'));
          this.dragState = null;
      } catch (err) {
          console.error('Drop error:', err);
      }
  }

  onMouseMove(e) {
    if (!this.dragState) return;
    const { type, startX, startY, isDragging } = this.dragState;

    if (!isDragging) {
      if (Math.abs(e.clientX - startX) > 5 || Math.abs(e.clientY - startY) > 5) {
        this.dragState.isDragging = true;
        if (type === 'tab') {
          const item = this.items.get(this.dragState.tabId);
          const ghost = document.createElement('div');
          ghost.className = 'tab-ghost';
          ghost.textContent = item.title;
          document.body.appendChild(ghost);
          this.dragState.ghost = ghost;
        }
      }
      return;
    }

    if (type === 'tab') {
      const ghost = this.dragState.ghost;
      ghost.style.left = (e.clientX + 10) + 'px';
      ghost.style.top = (e.clientY + 10) + 'px';
      this.handleDragOver(e);
    }
  }

  handleDragOver(e) {
    // Find target panel
    const target = document.elementFromPoint(e.clientX, e.clientY);
    const panelEl = target?.closest('.dock-panel');
    
    // Clear previous overlays
    document.querySelectorAll('.drop-overlay').forEach(el => el.classList.remove('active'));

    if (panelEl) {
      const rect = panelEl.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const w = rect.width;
      const h = rect.height;
      
      let zone = 'center';
      const threshold = 0.25; // 25% edge

      if (x < w * threshold) zone = 'left';
      else if (x > w * (1 - threshold)) zone = 'right';
      else if (y < h * threshold) zone = 'top';
      else if (y > h * (1 - threshold)) zone = 'bottom';

      this.dragState.dropTarget = { element: panelEl, zone };

      // Show indicator
      const overlay = panelEl.querySelector('.drop-overlay');
      const indicator = overlay.querySelector('.drop-indicator');
      overlay.classList.add('active');
      
      indicator.style.left = zone === 'right' ? '50%' : '0';
      indicator.style.top = zone === 'bottom' ? '50%' : '0';
      indicator.style.width = (zone === 'left' || zone === 'right') ? '50%' : '100%';
      indicator.style.height = (zone === 'top' || zone === 'bottom') ? '50%' : '100%';
      
      if (zone === 'center') {
          indicator.style.left = '0';
          indicator.style.top = '0';
          indicator.style.width = '100%';
          indicator.style.height = '100%';
          indicator.style.opacity = '0.2';
      } else {
          indicator.style.opacity = '0.5';
      }
    } else {
      this.dragState.dropTarget = null;
    }
  }

  onMouseUp(e) {
    if (!this.dragState) return;
    const { type, isDragging, ghost, tabId, sourcePanel, dropTarget } = this.dragState;

    if (isDragging) {
      if (type === 'tab') {
        ghost.remove();
        document.querySelectorAll('.drop-overlay').forEach(el => el.classList.remove('active'));

        if (dropTarget) {
          this.handleDrop(tabId, sourcePanel, dropTarget);
        } else {
          // Float
          this.floatPlugin(tabId, e.clientX, e.clientY);
        }
      }
    }
    this.dragState = null;
  }

  handleDrop(tabId, sourcePanel, { element, zone }) {
    const targetPanel = this.findPanelByElement(this.root, element);
    if (!targetPanel) return;

    const item = this.items.get(tabId);

    if (zone === 'center') {
      if (targetPanel === sourcePanel) return;
      // Move tab
      sourcePanel.removeTab(tabId);
      targetPanel.addTab(tabId, item.title, item.content);
      item.panel = targetPanel;
    } else {
      // Split
      sourcePanel.removeTab(tabId); // Remove from old

      // Create new panel
      const newPanel = new DockPanel(this);
      newPanel.addTab(tabId, item.title, item.content);
      item.panel = newPanel;

      // Create Split
      const orientation = (zone === 'left' || zone === 'right') ? 'horizontal' : 'vertical';
      const split = new DockSplit(orientation);
      
      // Replace targetPanel with split in its parent
      if (targetPanel.parent) {
        targetPanel.parent.replaceChild(targetPanel, split);
      } else if (targetPanel === this.root) {
        // Root split
        this.rootContainer.innerHTML = '';
        this.rootContainer.appendChild(split.element);
        this.root = split;
      }

      // Add children
      if (zone === 'left' || zone === 'top') {
        split.addChild(newPanel);
        split.addChild(targetPanel);
      } else {
        split.addChild(targetPanel);
        split.addChild(newPanel);
      }
    }
  }

  findPanelByElement(node, element) {
    if (node.element === element) return node;
    if (node instanceof DockSplit) {
      for (const child of node.children) {
        const found = this.findPanelByElement(child, element);
        if (found) return found;
      }
    }
    return null;
  }
}

window.DockManager = DockManager;
