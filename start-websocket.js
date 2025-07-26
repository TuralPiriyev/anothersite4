// start-websocket.js
// WebSocket server-i başlatmaq üçün script

const { spawn } = require('child_process');
const path = require('path');

console.log('🚀 Starting WebSocket Server...');

// WebSocket server faylının yolunu təyin et
const websocketServerPath = path.join(__dirname, 'websocket-server.js');

// WebSocket server-i başlat
const websocketProcess = spawn('node', [websocketServerPath], {
  stdio: 'inherit', // stdout/stderr-i parent process ilə paylaş
  env: {
    ...process.env,
    WEBSOCKET_PORT: process.env.WEBSOCKET_PORT || '8080',
    NODE_ENV: process.env.NODE_ENV || 'development'
  }
});

// Process events
websocketProcess.on('error', (error) => {
  console.error('❌ Failed to start WebSocket server:', error);
  process.exit(1);
});

websocketProcess.on('exit', (code, signal) => {
  if (code !== 0) {
    console.error(`❌ WebSocket server exited with code ${code}`);
  } else {
    console.log('✅ WebSocket server exited gracefully');
  }
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down WebSocket server...');
  websocketProcess.kill('SIGTERM');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down WebSocket server...');
  websocketProcess.kill('SIGTERM');
  process.exit(0);
});