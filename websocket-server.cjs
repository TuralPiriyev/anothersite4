// WebSocket server for real-time collaboration
const WebSocket = require('ws');
const http = require('http');
const url = require('url');
const express = require('express');
const cors = require('cors');
const expressWs = require('express-ws')(app, server);

const PORT = process.env.WEBSOCKET_PORT || 5000;

console.log('🔧 WebSocket Server Configuration:');
console.log(`📡 Port: ${PORT}`);
console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);

// Create HTTP server
const app = express();
app.use(cors());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const server = http.createServer(app);

// Create WebSocket server
const wss = new WebSocket.Server({ server });

// Store active connections by schema ID
const connections = new Map();
const userSessions = new Map();

// Broadcast message to all users in a schema except sender
function broadcastToSchema(schemaId, message, excludeUserId = null) {
  const schemaConnections = connections.get(schemaId) || new Set();
  
  schemaConnections.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN && ws.userId !== excludeUserId) {
      ws.send(JSON.stringify(message));
    }
  });
}

// Clean up closed connections
function cleanupConnection(ws, schemaId) {
  const schemaConnections = connections.get(schemaId);
  if (schemaConnections) {
    schemaConnections.delete(ws);
    if (schemaConnections.size === 0) {
      connections.delete(schemaId);
    }
  }
  
  if (ws.userId) {
    userSessions.delete(ws.userId);
  }
}

wss.on('connection', (ws, request) => {
  const pathname = url.parse(request.url).pathname;
  const pathParts = pathname.split('/');
  
  // Extract schema ID from URL path
  const schemaId = pathParts[pathParts.length - 1];
  
  if (!schemaId) {
    ws.close(1008, 'Schema ID required');
    return;
  }
  
  console.log(`New WebSocket connection for schema: ${schemaId}`);
  
  // Add connection to schema group
  if (!connections.has(schemaId)) {
    connections.set(schemaId, new Set());
  }
  connections.get(schemaId).add(ws);
  
  ws.schemaId = schemaId;
  ws.isAlive = true;
  
  // Handle incoming messages
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      
      switch (message.type) {
        case 'user_join':
          ws.userId = message.userId;
          ws.username = message.username;
          userSessions.set(message.userId, ws);
          
          // Notify other users
          broadcastToSchema(schemaId, {
            type: 'user_joined',
            user: {
              userId: message.userId,
              username: message.username,
              joinedAt: new Date().toISOString()
            }
          }, message.userId);
          
          console.log(`User ${message.username} joined schema ${schemaId}`);
          break;
          
        case 'user_leave':
          broadcastToSchema(schemaId, {
            type: 'user_left',
            userId: message.userId
          }, message.userId);
          
          console.log(`User ${message.username} left schema ${schemaId}`);
          break;
          
        case 'cursor_update':
          // Broadcast cursor position to other users
          broadcastToSchema(schemaId, {
            type: 'cursor_update',
            data: message.cursor
          }, message.cursor?.userId);
          break;
          
        case 'schema_change':
          // Broadcast schema changes to all users
          broadcastToSchema(schemaId, {
            type: 'schema_change',
            changeType: message.changeType,
            data: message.data,
            userId: message.userId,
            timestamp: message.timestamp
          }, message.userId);
          
          console.log(`Schema change: ${message.changeType} by ${message.userId}`);
          break;
          
        case 'user_selection':
          // Broadcast user selection to other users
          broadcastToSchema(schemaId, {
            type: 'user_selection',
            data: message.data
          }, message.data?.userId);
          break;
          
        case 'presence_update':
          // Broadcast presence updates
          broadcastToSchema(schemaId, {
            type: 'presence_update',
            data: message.data
          }, message.data?.userId);
          break;
          
        case 'ping':
          // Respond to heartbeat
          ws.send(JSON.stringify({ type: 'pong' }));
          break;
          
        default:
          console.log(`Unknown message type: ${message.type}`);
      }
    } catch (error) {
      console.error('Error processing WebSocket message:', error);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Invalid message format'
      }));
    }
  });
  app.ws('/ws/portfolio-updates', (ws, req) => {
  console.log('➿ Client subscribed to portfolio‑updates (on websocket-server.cjs)');

  ws.on('message', msg => {
    // Gələn yeniləməni broadcast et
    wss.clients.forEach(client => {
      if (client !== ws && client.readyState === WebSocket.OPEN) {
        client.send(msg);
      }
    });
  });

  ws.on('close', () => {
    console.log('❌ portfolio‑updates socket closed (websocket‑server.cjs)');
  });
});
  // Handle connection close
  ws.on('close', () => {
    console.log(`WebSocket connection closed for schema: ${schemaId}`);
    
    // Notify other users
    if (ws.userId) {
      broadcastToSchema(schemaId, {
        type: 'user_left',
        userId: ws.userId
      }, ws.userId);
    }
    
    cleanupConnection(ws, schemaId);
  });
  
  // Handle connection errors
  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
    cleanupConnection(ws, schemaId);
  });
  
  // Heartbeat to detect broken connections
  ws.on('pong', () => {
    ws.isAlive = true;
  });
});

// Heartbeat interval to clean up dead connections
const heartbeatInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) {
      console.log('Terminating dead connection');
      cleanupConnection(ws, ws.schemaId);
      return ws.terminate();
    }
    
    ws.isAlive = false;
    ws.ping();
  });
}, 30000); // Check every 30 seconds

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Shutting down WebSocket server...');
  clearInterval(heartbeatInterval);
  
  wss.clients.forEach((ws) => {
    ws.close(1001, 'Server shutting down');
  });
  
  wss.close(() => {
    console.log('WebSocket server closed');
    process.exit(0);
  });
});
// server.cjs içində, express-ws setup-dən sonra:


// Start server
server.listen(PORT, () => {
  console.log(`🚀 WebSocket server running on port ${PORT}`);
  console.log(`📡 Real-time collaboration enabled`);
});

// Export for testing
module.exports = { server, wss, connections, userSessions };