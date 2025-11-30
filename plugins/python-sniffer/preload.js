const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pythonSniffer', {
  onPacketBatch: (callback) => {
    ipcRenderer.removeAllListeners('python-sniffer:packet-data-batch');
    ipcRenderer.on('python-sniffer:packet-data-batch', (event, packets) => {
      callback(packets);
    });
  }
});
