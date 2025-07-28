// WebSocket server for real-time collaboration
const express = require('express');
const http = require('http');
const cors = require('cors');

const PORT = process.env.WEBSOCKET_PORT || 5000;

console.log('🔧 WebSocket Server Configuration:');
console.log(`📡 Port: ${PORT}`);
console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);

// Create HTTP server
const app = express();
app.use(cors());
const server = http.createServer(app);

// Set up express-ws
const expressWs = require('express-ws')(app, server);

// Store active connections by schema ID
const connections = new Map();
const userSessions = new Map();
const schemaData = new Map(); // Store schema data for each workspace

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    activeConnections: connections.size,
    totalUsers: userSessions.size
  });
});

// Broadcast message to all users in a schema except sender
function broadcastToSchema(schemaId, message, excludeUserId = null) {
  const schemaConnections = connections.get(schemaId);
  if (!schemaConnections) return;

  const messageStr = JSON.stringify(message);
  console.log(`📤 Broadcasting to schema ${schemaId}:`, message.type, `(${schemaConnections.size} connections)`);
  
  schemaConnections.forEach(ws => {
    if (ws.readyState === 1 && ws.userId !== excludeUserId) { // 1 = OPEN
      try {
        ws.send(messageStr);
      } catch (error) {
        console.error('Error sending message to client:', error);
        cleanupConnection(ws, schemaId);
      }
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
      schemaData.delete(schemaId);
    }
  }
  
  if (ws.userId) {
    userSessions.delete(ws.userId);
  }
}

// Express-ws route for collaboration
app.ws('/ws/collaboration/:schemaId', (ws, req) => {
  const schemaId = req.params.schemaId;
  
  if (!schemaId) {
    ws.close(1008, 'Schema ID required');
    return;
  }
  
  console.log(`✅ New WebSocket connection for schema: ${schemaId}`);
  
  // Add connection to schema group
  if (!connections.has(schemaId)) {
    connections.set(schemaId, new Set());
  }
  connections.get(schemaId).add(ws);
  
  ws.schemaId = schemaId;
  ws.isAlive = true;
  ws.connectedAt = Date.now();
  
  // Send connection established message with schema info
  ws.send(JSON.stringify({
    type: 'connection_established',
    clientId: `client_${Date.now()}`,
    schemaId: schemaId,
    timestamp: new Date().toISOString()
  }));
  
  // Send current users in schema
  const schemaConnections = connections.get(schemaId);
  if (schemaConnections) {
    const currentUsers = Array.from(schemaConnections)
      .filter(conn => conn.userId && conn.username)
      .map(conn => ({
        id: conn.userId,
        username: conn.username,
        role: conn.role || 'editor',
        color: conn.color || '#3B82F6',
        isOnline: true
      }));
    
    if (currentUsers.length > 0) {
      ws.send(JSON.stringify({
        type: 'current_users',
        users: currentUsers
      }));
    }
  }
  
  // Handle incoming messages
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      console.log(`📨 Received message for schema ${schemaId}:`, message.type);
      
      switch (message.type) {
        case 'user_join':
          ws.userId = message.userId;
          ws.username = message.username;
          ws.role = message.role || 'editor';
          ws.color = message.color || '#3B82F6';
          userSessions.set(message.userId, ws);
          
          // Broadcast user joined to others
          broadcastToSchema(schemaId, {
            type: 'user_joined',
            user: {
              id: message.userId,
              username: message.username,
              role: ws.role,
              color: ws.color,
              joinedAt: new Date().toISOString()
            }
          }, message.userId);
          
          console.log(`👋 User ${message.username} (${ws.role}) joined schema ${schemaId}`);
          break;
          
        case 'user_leave':
          broadcastToSchema(schemaId, {
            type: 'user_left',
            userId: message.userId,
            username: message.username
          }, message.userId);
          
          console.log(`👋 User ${message.username} left schema ${schemaId}`);
          break;
          
        case 'cursor_update':
          // Validate cursor data before broadcasting
          if (message.cursor && 
              typeof message.cursor === 'object' && 
              message.cursor.userId && 
              typeof message.cursor.userId === 'string') {
            
            // Add timestamp to cursor data
            const cursorData = {
              ...message.cursor,
              timestamp: new Date().toISOString()
            };
            
            // Broadcast cursor position to other users
            broadcastToSchema(schemaId, {
              type: 'cursor_update',
              data: cursorData
            }, message.cursor.userId);
            
            console.log(`📍 Cursor update from ${message.cursor.username || message.cursor.userId} broadcasted`);
          } else {
            console.warn('⚠️ Invalid cursor_update message received:', {
              hasCursor: !!message.cursor,
              cursorType: typeof message.cursor,
              hasUserId: !!message.cursor?.userId,
              userIdType: typeof message.cursor?.userId,
              fullMessage: message
            });
            
            // Send error response to sender only
            ws.send(JSON.stringify({
              type: 'error',
              message: 'Invalid cursor_update format. Expected cursor object with userId.'
            }));
          }
          break;
          
        case 'schema_change':
          // Validate schema change data
          if (!message.changeType || !message.data) {
            ws.send(JSON.stringify({
              type: 'error',
              message: 'Invalid schema_change format. Expected changeType and data.'
            }));
            break;
          }
          
          // Store schema data for this workspace
          if (!schemaData.has(schemaId)) {
            schemaData.set(schemaId, {});
          }
          
          // Update schema data
          const currentSchemaData = schemaData.get(schemaId);
          currentSchemaData[message.changeType] = message.data;
          currentSchemaData.lastUpdate = new Date().toISOString();
          currentSchemaData.lastUpdatedBy = message.userId;
          
          // Broadcast schema changes to all users
          const schemaChangeMessage = {
            type: 'schema_change',
            changeType: message.changeType,
            data: message.data,
            userId: message.userId,
            username: message.username,
            timestamp: new Date().toISOString()
          };
          
          broadcastToSchema(schemaId, schemaChangeMessage, message.userId);
          
          console.log(`🔄 Schema change: ${message.changeType} by ${message.username || message.userId}`);
          break;
          
        case 'user_selection':
          // Broadcast user selection to other users
          broadcastToSchema(schemaId, {
            type: 'user_selection',
            data: {
              ...message.data,
              timestamp: new Date().toISOString()
            }
          }, message.data?.userId);
          break;
          
        case 'presence_update':
          // Broadcast presence updates
          broadcastToSchema(schemaId, {
            type: 'presence_update',
            data: {
              ...message.data,
              timestamp: new Date().toISOString()
            }
          }, message.data?.userId);
          break;
          
        case 'table_created':
        case 'table_updated':
        case 'table_deleted':
        case 'relationship_added':
        case 'relationship_removed':
          // Handle specific schema operations
          const operationMessage = {
            type: 'schema_operation',
            operation: message.type,
            data: message.data,
            userId: message.userId,
            username: message.username,
            timestamp: new Date().toISOString()
          };
          
          broadcastToSchema(schemaId, operationMessage, message.userId);
          console.log(`🔄 Schema operation: ${message.type} by ${message.username || message.userId}`);
          break;
          
        case 'ping':
          // Respond to heartbeat
          ws.send(JSON.stringify({ type: 'pong' }));
          break;
          
        case 'get_schema_data':
          // Send current schema data to requesting user
          const schemaDataForUser = schemaData.get(schemaId) || {};
          ws.send(JSON.stringify({
            type: 'schema_data',
            data: schemaDataForUser,
            timestamp: new Date().toISOString()
          }));
          break;
          
        default:
          console.log(`❓ Unknown message type: ${message.type}`);
      }
    } catch (error) {
      console.error('❌ Error processing WebSocket message:', error);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Invalid message format'
      }));
    }
  });
  
  // Handle connection close
  ws.on('close', (code, reason) => {
    console.log(`👥 [${ws.userId || 'unknown'}] Socket closed - Code: ${code}, Reason: ${reason}`);
    
    if (ws.userId) {
      // Notify other users that this user has left
      broadcastToSchema(schemaId, {
        type: 'user_left',
        userId: ws.userId,
        username: ws.username
      }, ws.userId);
      
      console.log(`👋 User ${ws.username} disconnected from schema ${schemaId}`);
    }
    
    cleanupConnection(ws, schemaId);
  });
  
  // Handle errors
  ws.on('error', (error) => {
    console.error(`❌ WebSocket error for user ${ws.userId || 'unknown'}:`, error);
    cleanupConnection(ws, schemaId);
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`📡 Real-time collaboration enabled`);
  console.log(`   - ws://localhost:${PORT}/ws/collaboration/:schemaId`);
  console.log(`   - Health check: http://localhost:${PORT}/health`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🔄 Shutting down WebSocket server gracefully...');
  server.close(() => {
    console.log('✅ WebSocket server closed');
    process.exit(0);
  });
});

module.exports = { app, server };