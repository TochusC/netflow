const filterInput = document.getElementById('viz-filter');
const sortSelect = document.getElementById('viz-sort');
const refreshBtn = document.getElementById('viz-refresh');
const autoRefreshCheckbox = document.getElementById('viz-auto-refresh');
const tbody = document.getElementById('viz-tbody');
const statsDisplay = document.getElementById('viz-stats-display');
const tableWrapper = document.getElementById('viz-table-wrapper');
const scrollStatus = document.getElementById('viz-scroll-status');

// Modal elements
const modal = document.getElementById('viz-modal');
const modalClose = document.getElementById('viz-modal-close');
const modalContent = document.getElementById('viz-packet-detail');

let lastPacketCount = 0;
let autoRefreshInterval = null;
let isUserScrolling = false;

// Modal Logic
if (modalClose) {
  modalClose.onclick = () => modal.style.display = "none";
}
window.onclick = (event) => {
  if (event.target == modal) modal.style.display = "none";
}

function getPackets() {
  if (window.capturedPackets) {
    return window.capturedPackets;
  }
  return [];
}

// Advanced Filter Logic
function evaluateFilter(packet, filterStr) {
  if (!filterStr) return true;
  
  // Replace logical operators
  let expr = filterStr
    .replace(/\band\b/gi, '&&')
    .replace(/\bor\b/gi, '||')
    .replace(/\bnot\b/gi, '!');

  // Replace field names with packet properties
  // We use a regex that matches whole words only to avoid replacing parts of strings
  expr = expr.replace(/\bprotocol\b/gi, `(p.protocol || '')`)
              .replace(/\bsrc\b/gi, `(p.src || '')`)
              .replace(/\bdst\b/gi, `(p.dst || '')`)
              .replace(/\blength\b/gi, `(parseInt(p.length) || 0)`)
              .replace(/\btime\b/gi, `(p.time || '')`);

  try {
    // Create a safe-ish evaluation function
    // p is the packet object
    const func = new Function('p', `return ${expr};`);
    return func(packet);
  } catch (e) {
    // If syntax error (e.g. user is still typing), fallback to simple text search
    const lowerFilter = filterStr.toLowerCase();
    return (packet.protocol && packet.protocol.toLowerCase().includes(lowerFilter)) ||
            (packet.src && packet.src.toLowerCase().includes(lowerFilter)) ||
            (packet.dst && packet.dst.toLowerCase().includes(lowerFilter));
  }
}

function hexDump(hex) {
  if (!hex) return '';
  let output = '';
  for (let i = 0; i < hex.length; i += 32) { // 16 bytes = 32 hex chars
    const chunk = hex.substr(i, 32);
    const offset = (i / 2).toString(16).padStart(4, '0');
    
    let hexBytes = '';
    let ascii = '';
    
    for (let j = 0; j < 32; j += 2) {
      if (j < chunk.length) {
        const byteHex = chunk.substr(j, 2);
        hexBytes += byteHex + ' ';
        const code = parseInt(byteHex, 16);
        ascii += (code >= 32 && code <= 126) ? String.fromCharCode(code) : '.';
      } else {
        hexBytes += '   ';
      }
    }
    
    output += `<span class="hex-offset">${offset}</span>  <span class="hex-bytes">${hexBytes}</span>  <span class="hex-ascii">${ascii}</span>\n`;
  }
  return output;
}

window.showPacketDetail = function(index) {
  const packets = getPackets(); // Get original list to find by index? 
  // Actually, we need to find the packet. Since we might have filtered/sorted, 
  // passing the index from the rendered list is tricky if we don't have the object.
  // But we can pass the object ID if we had one. 
  // For now, let's assume we can pass the index in the *filtered* list? 
  // No, better to pass the raw_data directly or store it in a data attribute?
  // Raw data might be large.
  // Let's just find it in the global list if possible, or pass the index in the global list.
  // But we don't have unique IDs.
  // Let's attach the data to the button using a closure or just render it into the onclick.
  // Since we are generating HTML strings, we can't easily pass objects.
  // We will use a temporary global store for the current view's packets?
  // Or just encode the raw data in a data attribute (if not too huge).
  // Let's try to find the packet by reference? No.
  // Let's use the index in the global `window.capturedPackets` array.
  // But we need to know which one it is.
  // We can add an `_index` property to the packet objects when we get them.
};

let currentPackets = [];
const ROW_HEIGHT = 45;
const BUFFER_SIZE = 10;

function renderVirtual() {
  if (!tableWrapper || !tbody) return;

  const scrollTop = tableWrapper.scrollTop;
  const containerHeight = tableWrapper.clientHeight;
  const totalCount = currentPackets.length;

  let startIndex = Math.floor(scrollTop / ROW_HEIGHT) - BUFFER_SIZE;
  if (startIndex < 0) startIndex = 0;

  let endIndex = Math.ceil((scrollTop + containerHeight) / ROW_HEIGHT) + BUFFER_SIZE;
  if (endIndex > totalCount) endIndex = totalCount;

  const visiblePackets = currentPackets.slice(startIndex, endIndex);
  
  const paddingTop = startIndex * ROW_HEIGHT;
  const paddingBottom = (totalCount - endIndex) * ROW_HEIGHT;

  const rowsHtml = visiblePackets.map(p => `
      <tr style="height: ${ROW_HEIGHT}px">
        <td>${p.index || ''}</td>
        <td>${p.time || ''}</td>
        <td>${p.src || ''}</td>
        <td>${p.dst || ''}</td>
        <td>${p.protocol || ''}</td>
        <td>${p.length || ''}</td>
        <td>
          <button class="viz-btn-sm" onclick="window.openPacketDetail(${p._originalIndex})">
            查看数据
          </button>
        </td> 
      </tr>
    `).join('');

  const topSpacer = paddingTop > 0 ? `<tr style="height: ${paddingTop}px; border: none;"><td colspan="6" style="padding:0; border:none;"></td></tr>` : '';
  const bottomSpacer = paddingBottom > 0 ? `<tr style="height: ${paddingBottom}px; border: none;"><td colspan="6" style="padding:0; border:none;"></td></tr>` : '';

  tbody.innerHTML = topSpacer + rowsHtml + bottomSpacer;
}

function updateData(force = false) {
  const isTimeAsc = sortSelect.value === 'time-asc';
  
  if (tableWrapper) {
    const scrollTop = tableWrapper.scrollTop;
    const threshold = 50;

    if (!isTimeAsc && !force) {
      isUserScrolling = scrollTop > threshold;
    }
  }

  const isRenderingPaused = isUserScrolling && autoRefreshCheckbox.checked && !force;
  if (scrollStatus) scrollStatus.style.display = isRenderingPaused ? 'inline' : 'none';

  if (isRenderingPaused) return;

  const allPackets = getPackets();
  const packetsWithIndex = allPackets.map((p, i) => ({...p, _originalIndex: i}));
  
  let packets = [...packetsWithIndex];

  const filterText = filterInput.value;
  if (filterText) {
    packets = packets.filter(p => evaluateFilter(p, filterText));
  }

  const sortValue = sortSelect.value;
  packets.sort((a, b) => {
    switch (sortValue) {
      case 'time-desc':
        return (b.time || '').localeCompare(a.time || '');
      case 'time-asc':
        return (a.time || '').localeCompare(b.time || '');
      case 'length-desc':
        return (parseInt(b.length) || 0) - (parseInt(a.length) || 0);
      case 'length-asc':
        return (parseInt(a.length) || 0) - (parseInt(b.length) || 0);
      case 'protocol':
        return (a.protocol || '').localeCompare(b.protocol || '');
      default:
        return 0;
    }
  });

  currentPackets = packets;
  lastPacketCount = allPackets.length;

  if (statsDisplay) {
      const countText = statsDisplay.querySelector('span:first-child');
      if (countText) countText.textContent = `显示: ${packets.length} / 总计: ${allPackets.length} (过滤后: ${packets.length})`;
  }

  renderVirtual();
}

// Global function for the button onclick
window.openPacketDetail = function(index) {
  const packets = getPackets();
  const packet = packets[index];
  if (packet) {
    const rawData = packet.raw_data || '';
    const hexView = hexDump(rawData);
    
    modalContent.innerHTML = `
      <div style="margin-bottom: 15px;">
        <strong>时间:</strong> ${packet.time} <br>
        <strong>协议:</strong> ${packet.protocol} <br>
        <strong>源:</strong> ${packet.src} -> <strong>目的:</strong> ${packet.dst} <br>
        <strong>长度:</strong> ${packet.length} bytes
      </div>
      <div class="hex-view">${hexView || '无原始数据'}</div>
    `;
    modal.style.display = "block";
  }
};

if (refreshBtn) refreshBtn.addEventListener('click', () => {
    isUserScrolling = false; 
    updateData(true);
});
if (filterInput) filterInput.addEventListener('input', () => updateData(true));
if (sortSelect) sortSelect.addEventListener('change', () => {
    isUserScrolling = false; 
    updateData(true);
});

if (tableWrapper) {
  tableWrapper.addEventListener('scroll', () => {
    const isTimeAsc = sortSelect.value === 'time-asc';
    const scrollTop = tableWrapper.scrollTop;
    const threshold = 50;
    
    if (!isTimeAsc) {
        isUserScrolling = scrollTop > threshold;
        const isRenderingPaused = isUserScrolling && autoRefreshCheckbox.checked;
        if (scrollStatus) scrollStatus.style.display = isRenderingPaused ? 'inline' : 'none';
    }
    renderVirtual();
  });
}

function startAutoRefresh() {
  if (autoRefreshInterval) clearInterval(autoRefreshInterval);
  autoRefreshInterval = setInterval(() => {
    const currentCount = getPackets().length;
    if (currentCount !== lastPacketCount) {
      updateData();
    }
  }, 200); 
}

function stopAutoRefresh() {
  if (autoRefreshInterval) clearInterval(autoRefreshInterval);
}

if (autoRefreshCheckbox) {
  autoRefreshCheckbox.addEventListener('change', (e) => {
    if (e.target.checked) {
      startAutoRefresh();
    } else {
      stopAutoRefresh();
    }
  });
}

// Initial render
updateData(true);
startAutoRefresh();

console.log('Packet Visualizer Renderer Loaded');
