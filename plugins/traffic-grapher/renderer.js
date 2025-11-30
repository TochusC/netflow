const canvas = document.getElementById('traffic-canvas');
const ctx = canvas.getContext('2d');
const filterInput = document.getElementById('traffic-filter-input');
const refreshBtn = document.getElementById('traffic-refresh-btn');
const autoRefreshCheckbox = document.getElementById('traffic-auto-refresh');
const totalPacketsEl = document.getElementById('traffic-total-packets');
const displayedPacketsEl = document.getElementById('traffic-displayed-packets');
const tooltip = document.getElementById('traffic-tooltip');

let animationFrameId;
let lastDrawTime = 0;
const REFRESH_RATE = 1000; // 1 second

function resizeCanvas() {
  const container = canvas.parentElement;
  canvas.width = container.clientWidth;
  canvas.height = container.clientHeight;
  drawGraph();
}

window.addEventListener('resize', resizeCanvas);

// Initial resize
setTimeout(resizeCanvas, 100);

refreshBtn.addEventListener('click', () => {
  drawGraph();
});

function parseTime(timeStr) {
  // timeStr is HH:mm:ss.sss
  const now = new Date();
  const [h, m, s] = timeStr.split(':');
  const [sec, ms] = s.split('.');
  
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 
                        parseInt(h), parseInt(m), parseInt(sec), parseInt(ms || 0));
  return date.getTime();
}

function drawGraph() {
  // Ensure canvas size is correct
  const container = canvas.parentElement;
  if (container && (canvas.width !== container.clientWidth || canvas.height !== container.clientHeight)) {
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
  }

  if (!window.capturedPackets || window.capturedPackets.length === 0) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#666';
    ctx.font = '14px Segoe UI, Arial';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    
    if (!window.capturedPackets) {
       ctx.fillText('等待数据包... (请确保嗅探器插件正在运行)', 20, 30);
    } else {
       ctx.fillText('尚未捕获到数据包。', 20, 30);
    }
    
    if (totalPacketsEl) totalPacketsEl.textContent = '0';
    if (displayedPacketsEl) displayedPacketsEl.textContent = '0';
    return;
  }

  const filterText = filterInput.value.trim().toLowerCase();
  const allPackets = window.capturedPackets;
  
  // Filter packets
  const packets = allPackets.filter(p => {
    if (!filterText) return true;
    return (p.protocol && p.protocol.toLowerCase().includes(filterText)) ||
           (p.src && p.src.includes(filterText)) ||
           (p.dst && p.dst.includes(filterText));
  });

  if (totalPacketsEl) totalPacketsEl.textContent = allPackets.length;
  if (displayedPacketsEl) displayedPacketsEl.textContent = packets.length;

  if (packets.length === 0) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#666';
    ctx.font = '14px Segoe UI, Arial';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('No packets match the filter.', 20, 30);
    return;
  }

  // Process data: Group by second
  const timeBuckets = new Map();
  let minTime = Infinity;
  let maxTime = -Infinity;

  packets.forEach(p => {
    try {
      if (!p.time) return;
      const timestamp = parseTime(p.time);
      if (isNaN(timestamp)) return;

      const second = Math.floor(timestamp / 1000) * 1000; // Floor to second
      
      if (!timeBuckets.has(second)) {
        timeBuckets.set(second, { bytes: 0, count: 0 });
      }
      
      const bucket = timeBuckets.get(second);
      bucket.bytes += (p.length || 0);
      bucket.count += 1;

      if (second < minTime) minTime = second;
      if (second > maxTime) maxTime = second;
    } catch (e) {
      console.error('Error parsing packet time:', p.time, e);
    }
  });

  if (minTime === Infinity) {
    // Should not happen if packets.length > 0 but just in case
    return;
  }

  // Fill in gaps
  const dataPoints = [];
  for (let t = minTime; t <= maxTime; t += 1000) {
    const bucket = timeBuckets.get(t) || { bytes: 0, count: 0 };
    dataPoints.push({ time: t, value: bucket.bytes });
  }

  // Draw
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  const padding = { top: 20, right: 20, bottom: 30, left: 60 };
  const graphWidth = canvas.width - padding.left - padding.right;
  const graphHeight = canvas.height - padding.top - padding.bottom;

  // Find max value for Y scale
  let maxValue = 0;
  dataPoints.forEach(d => {
    if (d.value > maxValue) maxValue = d.value;
  });
  
  // Ensure we have some height
  if (maxValue === 0) maxValue = 100;

  // Draw Axes
  ctx.beginPath();
  ctx.strokeStyle = '#e9ecef';
  ctx.lineWidth = 1;
  
  // Y Axis
  ctx.moveTo(padding.left, padding.top);
  ctx.lineTo(padding.left, canvas.height - padding.bottom);
  
  // X Axis
  ctx.lineTo(canvas.width - padding.right, canvas.height - padding.bottom);
  ctx.stroke();

  // Draw Y Labels
  ctx.fillStyle = '#6c757d';
  ctx.font = '10px Segoe UI, Arial';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  
  const ySteps = 5;
  for (let i = 0; i <= ySteps; i++) {
    const val = (maxValue / ySteps) * i;
    const y = canvas.height - padding.bottom - (graphHeight / ySteps) * i;
    ctx.fillText(formatBytes(val), padding.left - 10, y);
    
    // Grid line
    ctx.beginPath();
    ctx.strokeStyle = '#f1f3f5';
    ctx.moveTo(padding.left, y);
    ctx.lineTo(canvas.width - padding.right, y);
    ctx.stroke();
  }

  // Draw Line
  if (dataPoints.length > 1) {
    ctx.beginPath();
    ctx.strokeStyle = '#007bff';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    
    dataPoints.forEach((d, i) => {
      const x = padding.left + (i / (dataPoints.length - 1)) * graphWidth;
      const y = canvas.height - padding.bottom - (d.value / maxValue) * graphHeight;
      
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    
    ctx.stroke();
    
    // Fill area
    ctx.lineTo(padding.left + graphWidth, canvas.height - padding.bottom);
    ctx.lineTo(padding.left, canvas.height - padding.bottom);
    ctx.fillStyle = 'rgba(0, 123, 255, 0.1)';
    ctx.fill();
  }

  // Draw X Labels (Time)
  ctx.fillStyle = '#6c757d';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  
  const xSteps = 5; // Max number of labels
  const stepSize = Math.max(1, Math.ceil(dataPoints.length / xSteps));
  
  for (let i = 0; i < dataPoints.length; i += stepSize) {
    const d = dataPoints[i];
    const x = padding.left + (i / (dataPoints.length - 1)) * graphWidth;
    const date = new Date(d.time);
    const timeStr = date.toLocaleTimeString();
    ctx.fillText(timeStr, x, canvas.height - padding.bottom + 8);
  }
  
  // Store data for tooltip
  canvas.dataPoints = dataPoints;
  canvas.graphArea = { padding, graphWidth, graphHeight, maxValue };
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// Tooltip interaction
canvas.addEventListener('mousemove', (e) => {
  if (!canvas.dataPoints || canvas.dataPoints.length === 0) return;
  
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  
  const { padding, graphWidth, graphHeight, maxValue } = canvas.graphArea;
  
  if (x < padding.left || x > padding.left + graphWidth ||
      y < padding.top || y > canvas.height - padding.bottom) {
    tooltip.style.display = 'none';
    return;
  }
  
  // Find closest data point
  const ratio = (x - padding.left) / graphWidth;
  const index = Math.round(ratio * (canvas.dataPoints.length - 1));
  
  if (index >= 0 && index < canvas.dataPoints.length) {
    const d = canvas.dataPoints[index];
    const date = new Date(d.time);
    
    tooltip.style.display = 'block';
    tooltip.style.left = (e.clientX + 10) + 'px';
    tooltip.style.top = (e.clientY + 10) + 'px';
    tooltip.innerHTML = `
      Time: ${date.toLocaleTimeString()}<br>
      Traffic: ${formatBytes(d.value)}
    `;
  }
});

canvas.addEventListener('mouseout', () => {
  tooltip.style.display = 'none';
});

// Auto refresh loop
function loop() {
  if (autoRefreshCheckbox.checked) {
    const now = Date.now();
    if (now - lastDrawTime > REFRESH_RATE) {
      drawGraph();
      lastDrawTime = now;
    }
  }
  animationFrameId = requestAnimationFrame(loop);
}

console.log("Traffic Grapher Running.")

loop();

// Initial draw
drawGraph();