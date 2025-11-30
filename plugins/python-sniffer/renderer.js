const packetsTable = document.getElementById('python-packets-table');
const statsTable = document.getElementById('python-stats-table');
const startBtn = document.getElementById('python-start-btn');
const stopBtn = document.getElementById('python-stop-btn');
const filterInput = document.getElementById('python-filter-input');
const MAX_PACKETS = 32

const toggleBtn = document.getElementById('toggle-sections-btn');
const statsPanel = document.querySelector('.stats-panel');
let expanded = false;

statsPanel.style.maxHeight = '0';
toggleBtn.textContent = '展开统计数据';

toggleBtn.addEventListener('click', function() {
  expanded = !expanded;
  statsPanel.style.maxHeight = expanded ? '2000px' : '0';
  toggleBtn.textContent = expanded ? '收起统计数据' : '展开统计数据';
});

let totalPackets = 0;
const totalPacketsEl = document.getElementById('total-packets');

if (startBtn) {
  console.log('Attaching start button handler');
  startBtn.onclick = async () => {
    const filter = filterInput ? filterInput.value : '';
    await window.netflowAPI.startPlugin('python-sniffer', { filter });
  };
}

if (stopBtn) {
  console.log('Attaching stop button handler');
  stopBtn.onclick = async () => {
    await window.netflowAPI.stopPlugin('python-sniffer');
    console.log('Python Sniffer stopped');
  };
}

function updateStat(protocol) {
  let row = Array.from(statsTable.rows).find(r => r.cells[0].innerText === protocol);
  if (row) {
    let count = parseInt(row.cells[1].innerText) + 1;
    row.cells[1].innerText = count;
  } else {
    row = document.createElement('tr');
    row.innerHTML = `<td>${protocol}</td><td>1</td>`;
    statsTable.appendChild(row);
  }
}

if (window.pythonSniffer) {
  window.pythonSniffer.onPacketBatch((packets) => {
    const fragment = document.createDocumentFragment();

    // 使用全局变量存储数据，因为 window.pythonSniffer 是只读的
    if (!window.capturedPackets) {
      window.capturedPackets = [];
    }
    window.capturedPackets = window.capturedPackets.concat(packets);

    packets.forEach(packet => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${packet.time || ''}</td>
        <td>${packet.src || ''}</td>
        <td>${packet.dst || ''}</td>
        <td>${packet.protocol || ''}</td>
        <td>${packet.length || ''}</td>
      `;
      fragment.appendChild(row);

      updateStat(packet.protocol);
    });

    packetsTable.appendChild(fragment);

    // 移除旧数据
    while (packetsTable.children.length > MAX_PACKETS) {
      packetsTable.removeChild(packetsTable.firstChild);
    }

    // 更新总数据包数量
    totalPackets += packets.length;
    totalPacketsEl.textContent = `总数据包: ${totalPackets}`;
  });
} else {
  console.error('pythonSniffer API not available in preload');
}
