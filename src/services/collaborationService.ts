export interface CollaborationUser {
  id: string;
  username: string;
  role: 'admin' | 'editor' | 'viewer';
  avatar?: string;
  color: string;
}

export interface CursorPosition {
  x: number;
  y: number;
  tableId?: string;
  columnId?: string;
}

export interface SchemaChange {
  type: 'table_created' | 'table_updated' | 'table_deleted' | 'relationship_added' | 'relationship_removed';
  data: any;
  userId: string;
  timestamp: Date;
}

// WebSocket URL helper
const getWebSocketUrl = (schemaId: string) => {
  if (import.meta.env.DEV) {
    const wsPort = import.meta.env.VITE_WS_PORT || '8080';
    return `ws://localhost:${wsPort}/collaboration/${schemaId}`;
  }
  
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  return `${protocol}//${host}/ws/collaboration/${schemaId}`;
};

export default class CollaborationService {
  private socket: WebSocket | null = null;
  private currentUser: CollaborationUser | null = null;
  private schemaId: string | null = null;
  private eventHandlers: Map<string, Function[]> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectInterval = 3000;

  constructor() {
    // Constructor boş
  }

  initialize(user: CollaborationUser, schemaId: string) {
    this.currentUser = user;
    this.schemaId = schemaId;
    console.log('🔧 CollaborationService initialized:', { user: user.username, schemaId });
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.currentUser || !this.schemaId) {
        const error = new Error('Must initialize with user and schema ID before connecting');
        console.error('❌ Connection failed:', error.message);
        reject(error);
        return;
      }

      if (this.socket?.readyState === WebSocket.OPEN) {
        console.log('✅ WebSocket already connected');
        resolve();
        return;
      }

      const url = getWebSocketUrl(this.schemaId);
      console.log('🔗 Connecting to WebSocket:', url);
      
      try {
        this.socket = new WebSocket(url);

        this.socket.onopen = () => {
          console.log('✅ WebSocket connected successfully');
          this.reconnectAttempts = 0;
          
          // İstifadəçi qoşulma mesajı göndər
          this.sendMessage({
            type: 'user_join',
            userId: this.currentUser!.id,
            username: this.currentUser!.username,
            schemaId: this.schemaId!
          });
          
          this.emit('connected');
          resolve();
        };

        this.socket.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            console.log('📨 Received message:', message.type);
            this.handleMessage(message);
          } catch (error) {
            console.error('❌ Failed to parse message:', error);
          }
        };

        this.socket.onclose = (event) => {
          console.log('❌ WebSocket closed:', event.code, event.reason);
          this.emit('disconnected');
          
          // Otomatik yenidən bağlanma
          if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            console.log(`🔄 Reconnecting... Attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
            setTimeout(() => {
              this.connect();
            }, this.reconnectInterval);
          }
        };

        this.socket.onerror = (error) => {
          console.error('❌ WebSocket error:', error);
          this.emit('error', error);
          reject(error);
        };

      } catch (error) {
        console.error('❌ Failed to create WebSocket:', error);
        reject(error);
      }
    });
  }

  private handleMessage(message: any) {
    switch (message.type) {
      case 'user_joined':
        console.log('👋 User joined:', message.user?.username);
        this.emit('user_joined', message.user);
        break;
        
      case 'user_left':
        console.log('👋 User left:', message.userId);
        this.emit('user_left', message.userId);
        break;
        
      case 'cursor_update':
        this.emit('cursor_update', message.data);
        break;
        
      case 'schema_change':
        console.log('🔄 Schema changed:', message.changeType);
        this.emit('schema_change', message);
        break;
        
      case 'user_selection':
        this.emit('user_selection', message.data);
        break;
        
      case 'presence_update':
        this.emit('presence_update', message.data);
        break;
        
      case 'pong':
        // Heartbeat response
        break;
        
      default:
        console.log('❓ Unknown message type:', message.type);
    }
  }

  sendCursorUpdate(position: CursorPosition) {
    this.sendMessage({
      type: 'cursor_update',
      cursor: {
        userId: this.currentUser!.id,
        username: this.currentUser!.username,
        position,
        color: this.currentUser!.color,
        lastSeen: new Date().toISOString()
      }
    });
  }

  sendSchemaChange(change: SchemaChange) {
    this.sendMessage({
      type: 'schema_change',
      changeType: change.type,
      data: change.data,
      userId: this.currentUser!.id,
      timestamp: new Date().toISOString()
    });
  }

  sendUserSelection(selection: { tableId?: string; columnId?: string }) {
    this.sendMessage({
      type: 'user_selection',
      data: {
        userId: this.currentUser!.id,
        selection,
        timestamp: new Date().toISOString()
      }
    });
  }

  updatePresence(status: 'online' | 'away' | 'busy', currentAction?: string) {
    this.sendMessage({
      type: 'presence_update',
      data: {
        userId: this.currentUser!.id,
        status,
        currentAction,
        timestamp: new Date().toISOString()
      }
    });
  }

  private sendMessage(message: any) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      try {
        this.socket.send(JSON.stringify(message));
      } catch (error) {
        console.error('❌ Failed to send message:', error);
      }
    } else {
      console.warn('⚠️ WebSocket not connected, message not sent:', message.type);
    }
  }

  on(event: string, handler: Function) {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event)!.push(handler);
  }

  off(event: string, handler: Function) {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  private emit(event: string, data?: any) {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(data);
        } catch (error) {
          console.error(`❌ Error in event handler for ${event}:`, error);
        }
      });
    }
  }

  disconnect() {
    if (this.socket && this.currentUser) {
      this.sendMessage({
        type: 'user_leave',
        userId: this.currentUser.id,
        schemaId: this.schemaId
      });
    }
    
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    
    console.log('🔌 Disconnected from WebSocket');
  }

  // Utility methods
  isConnected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  getConnectionState(): string {
    if (!this.socket) return 'CLOSED';
    
    switch (this.socket.readyState) {
      case WebSocket.CONNECTING: return 'CONNECTING';
      case WebSocket.OPEN: return 'OPEN';
      case WebSocket.CLOSING: return 'CLOSING';
      case WebSocket.CLOSED: return 'CLOSED';
      default: return 'UNKNOWN';
    }
  }

  // Conflict resolution methods
  transformOperation(operation: any, otherOperation: any): any {
    if (operation.type === 'table_update' && otherOperation.type === 'table_update') {
      if (operation.tableId === otherOperation.tableId) {
        return this.mergeTableOperations(operation, otherOperation);
      }
    }
    return operation;
  }

  private mergeTableOperations(op1: any, op2: any): any {
    return {
      ...op1,
      data: {
        ...op1.data,
        ...op2.data,
        lastModified: Math.max(
          new Date(op1.timestamp).getTime(),
          new Date(op2.timestamp).getTime()
        )
      }
    };
  }

  resolveConflict(localChange: any, remoteChange: any): any {
    // Remote changes win (last-write-wins strategy)
    return remoteChange;
  }
}

export const collaborationService = new CollaborationService();