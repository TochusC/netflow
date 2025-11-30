const generateBtn = document.getElementById('btn-generate-pdf');
const titleInput = document.getElementById('report-title');
const limitSelect = document.getElementById('report-limit');
const protocolSelect = document.getElementById('report-protocol');
const fontInput = document.getElementById('report-font');
const statusDiv = document.getElementById('report-status');

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // result is "data:font/ttf;base64,......"
      const result = reader.result;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

generateBtn.addEventListener('click', async () => {
  try {
    statusDiv.textContent = 'Generating report...';
    
    if (!window.jspdf) {
      throw new Error('jsPDF library not loaded');
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    // Check for non-ASCII characters in title
    const hasNonAscii = (str) => /[^\u0000-\u007f]/.test(str);
    if (hasNonAscii(titleInput.value) && fontInput.files.length === 0) {
        if (!confirm("检测到标题包含中文字符，但未选择中文字体文件。生成的 PDF 中文字可能会显示为乱码。\n\n是否继续？")) {
            statusDiv.textContent = '已取消生成';
            return;
        }
    }

    // Handle Custom Font
    let fontName = 'helvetica'; // Default
    if (fontInput.files.length > 0) {
      try {
        statusDiv.textContent = 'Loading font...';
        const fontFile = fontInput.files[0];
        console.log('Loading font file:', fontFile);
        const fontBase64 = await readFileAsBase64(fontFile);
        const fileName = "custom_font.ttf";
        
        doc.addFileToVFS(fileName, fontBase64);
        doc.addFont(fileName, "CustomFont", "normal");
        doc.setFont("CustomFont");
        fontName = "CustomFont";
      } catch (err) {
        console.error('Failed to load font:', err);
        statusDiv.textContent = 'Error loading font. Using default.';
      }
    } else {
        // Warn if title contains non-ascii and no font selected?
        // Just proceed.
    }


    let packets = window.capturedPackets || [];
    
    // Apply Protocol Filter
    const protocolFilter = protocolSelect.value;
    if (protocolFilter !== 'all') {
      packets = packets.filter(p => (p.protocol || '').toUpperCase().includes(protocolFilter.toUpperCase()));
    }

    if (packets.length === 0) {
      statusDiv.textContent = `No packets found for protocol: ${protocolFilter}`;
      return;
    }

    const limit = limitSelect.value === 'all' ? packets.length : parseInt(limitSelect.value);
    const reportPackets = packets.slice(-limit); // Get last N packets

    // Title
    doc.setFontSize(18);
    // Use English for PDF content to avoid font issues
    doc.text(titleInput.value || 'Network Traffic Report', 14, 22);
    
    doc.setFontSize(11);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 30);
    doc.text(`Filter: Protocol=${protocolFilter}`, 14, 36);
    doc.text(`Total Packets: ${packets.length} (Included: ${reportPackets.length})`, 14, 42);

    // Statistics Calculation
    let totalBytes = 0;
    const srcCounts = {};
    const dstCounts = {};
    const protoStats = {}; // { proto: { count: 0, bytes: 0 } }
    
    reportPackets.forEach(p => {
      const len = parseInt(p.length) || 0;
      totalBytes += len;
      
      const src = p.src || 'Unknown';
      srcCounts[src] = (srcCounts[src] || 0) + 1;
      
      const dst = p.dst || 'Unknown';
      dstCounts[dst] = (dstCounts[dst] || 0) + 1;
      
      const proto = p.protocol || 'Unknown';
      if (!protoStats[proto]) protoStats[proto] = { count: 0, bytes: 0 };
      protoStats[proto].count++;
      protoStats[proto].bytes += len;
    });

    const getTopN = (obj, n) => Object.entries(obj)
        .sort((a, b) => b[1] - a[1])
        .slice(0, n);

    const topSrc = getTopN(srcCounts, 5);
    const topDst = getTopN(dstCounts, 5);
    
    // Prepare Protocol Data for Table
    const protoTableData = Object.entries(protoStats)
        .sort((a, b) => b[1].count - a[1].count)
        .map(([proto, stats]) => [
            proto, 
            stats.count, 
            ((stats.count / reportPackets.length) * 100).toFixed(1) + '%',
            (stats.bytes / 1024).toFixed(2) + ' KB'
        ]);

    let currentY = 50;

    // --- Section 1: Executive Summary ---
    doc.setFontSize(14);
    doc.setTextColor(44, 62, 80);
    doc.text('1. Executive Summary', 14, currentY);
    currentY += 8;
    
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    const avgSize = reportPackets.length ? (totalBytes / reportPackets.length).toFixed(0) : 0;
    const duration = reportPackets.length > 1 ? 
        `Time Range: ${reportPackets[0].time} - ${reportPackets[reportPackets.length-1].time}` : '';

    doc.text(`Total Packets: ${reportPackets.length}`, 14, currentY);
    doc.text(`Total Volume: ${(totalBytes / 1024).toFixed(2)} KB`, 80, currentY);
    currentY += 6;
    doc.text(`Avg Packet Size: ${avgSize} Bytes`, 14, currentY);
    if (duration) {
        doc.text(duration, 80, currentY);
    }
    currentY += 10;

    // --- Section 2: Protocol Distribution ---
    if (doc.autoTable) {
        const commonTableStyles = {
            font: fontName,
            fontStyle: 'normal',
        };

        doc.setFontSize(14);
        doc.setTextColor(44, 62, 80);
        doc.text('2. Protocol Distribution', 14, currentY);
        currentY += 5;

        doc.autoTable({
            startY: currentY,
            head: [['Protocol', 'Count', 'Percentage', 'Volume']],
            body: protoTableData,
            theme: 'striped',
            headStyles: { fillColor: [52, 152, 219], font: fontName },
            styles: { fontSize: 9, font: fontName },
            margin: { left: 14 }
        });
        currentY = doc.lastAutoTable.finalY + 10;

        // --- Section 3: Top Talkers ---
        doc.setFontSize(14);
        doc.setTextColor(44, 62, 80);
        doc.text('3. Top Talkers', 14, currentY);
        currentY += 5;

        // Top Sources
        doc.setFontSize(11);
        doc.setTextColor(0, 0, 0);
        doc.text('Top 5 Source IPs', 14, currentY);
        
        doc.autoTable({
            startY: currentY + 2,
            head: [['Source IP', 'Packets']],
            body: topSrc,
            theme: 'grid',
            headStyles: { fillColor: [46, 204, 113], font: fontName },
            styles: { fontSize: 9, font: fontName },
            margin: { left: 14, right: 110 } // Left side
        });
        
        let finalY1 = doc.lastAutoTable.finalY;

        // Top Destinations (Right side)
        doc.text('Top 5 Destination IPs', 110, currentY);
        doc.autoTable({
            startY: currentY + 2,
            head: [['Destination IP', 'Packets']],
            body: topDst,
            theme: 'grid',
            headStyles: { fillColor: [231, 76, 60], font: fontName },
            styles: { fontSize: 9, font: fontName },
            margin: { left: 110 } // Right side
        });
        
        let finalY2 = doc.lastAutoTable.finalY;
        currentY = Math.max(finalY1, finalY2) + 15;

        // --- Section 4: Packet Details ---
        doc.setFontSize(14);
        doc.setTextColor(44, 62, 80);
        doc.text('4. Packet Details', 14, currentY);
        
        const tableData = reportPackets.map(p => [
            p.time,
            p.src,
            p.dst,
            p.protocol,
            p.length
        ]);

        doc.autoTable({
            startY: currentY + 5,
            head: [['Time', 'Source', 'Destination', 'Protocol', 'Length']],
            body: tableData,
            theme: 'plain',
            styles: { fontSize: 8, font: fontName },
            headStyles: { fillColor: [149, 165, 166], font: fontName },
        });
    } else {
        // Fallback for no autoTable (simplified)
        doc.text("Detailed table requires autoTable plugin.", 14, currentY);
    }

    // Save
    const fileName = `report_${new Date().getTime()}.pdf`;
    doc.save(fileName);
    
    statusDiv.textContent = `Report generated: ${fileName}`;
  } catch (e) {
    console.error(e);
    statusDiv.textContent = `Error: ${e.message}`;
  }
});

console.log('Network Reporter Renderer Loaded');
