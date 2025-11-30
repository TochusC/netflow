// Import necessary Node.js modules
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Export the module with start and stop functionality for the plugin
module.exports = {
  // Start the plugin
  start: async (context, options) => {
    // Build the path to the executable file
    const exePath = path.join(context.dir, 'sniffer.exe');

    // Check if the executable file exists
    if (!fs.existsSync(exePath)) {
      throw new Error('Executable not found: ' + exePath);
    }

    // Spawn the child process with the filter option
    const child = spawn(exePath, [options.filter || '']);

    // Initialize buffer for storing output
    let buffer = '';

    // Listen for data on stdout
    child.stdout.on('data', (data) => {
      // Append data to buffer
      buffer += data.toString();
      // Split buffer into lines
      let lines = buffer.split('\n');
      // Keep the last line (may be incomplete)
      buffer = lines.pop();

      // Initialize packets array
      const packets = [];
      // Process each line
      for (const line of lines) {
        const output = line.trim();
        // Skip empty lines
        if (!output) continue;

        // Match packet information using regex
        const match = output.match(/Packet: src_ip=(.+?), dst_ip=(.+?), protocol=(.+), length=(\d+), raw_data=(.+)/);
        if (match) {
          // Create packet object
          const packet = {
            time: new Date().toISOString().split('T')[1].replace('Z', ''),
            src: match[1],
            dst: match[2],
            protocol: match[3],
            length: parseInt(match[4], 10),
            raw_data: match[5]
          };
          // Add to packets array
          packets.push(packet);
        }
      }

      // Send packets to renderer if any
      if (packets.length > 0) {
        if (context && context.sender) {
          context.sender.send(`${context.pluginName}:packet-data-batch`, packets);
        }
      }
    });

    // Listen for data on stderr
    child.stderr.on('data', (data) => {
      console.error(`[python-sniffer] stderr: ${data}`);
    });

    // Listen for close event
    child.on('close', (code) => {
      console.log(`[python-sniffer] exited with code ${code}`);
    });

    // Return process object and stop method
    return {
      process: child,
      stop: async () => {
        // Kill the child process
        child.kill();
      }
    };
  }
};
