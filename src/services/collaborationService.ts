import { useWebSocket } from '../hooks/useWebSocket';

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

class CollaborationService {
  private wsUrl: string;
  private currentUser: CollaborationUser | null = null;
  private schemaId: string | null = null;
  private eventHandlers: Map<string, Function[]> = new Map();

  constructor() {
    this.wsUrl = process.env.NODE_ENV === 'production' 
      ? 'wss://your-domain.com/ws' 
      : 'ws://localhost:8080/ws';
  }

  initialize(user: CollaborationUser, schemaId: string) {
    this.currentUser = user;
    this.schemaId = schemaId;
  }

  connect() {
    if (!this.currentUser || !this.schemaId) {
      throw new Error('Must initialize with user and schema ID before connecting');
    }

    return useWebSocket({
      url: `${this.wsUrl}/collaboration/${this.schemaId}`,
      onOpen: () => {
        this.sendMessage({
          type: 'user_join',
          data: {
            user: this.currentUser,
            schemaId: this.schemaId
          }
        });
        this.emit('connected');
      },
      onClose: () => {
        this.emit('disconnected');
      },
      onError: (error) => {
        this.emit('error', error);
      },
      onMessage: (message) => {
        this.handleMessage(message);
      }
    });
  }

  private handleMessage(message: any) {
    switch (message.type) {
      case 'user_joined':
        this.emit('user_joined', message.data.user);
        break;
      case 'user_left':
        this.emit('user_left', message.data.userId);
        break;
      case 'cursor_update':
        this.emit('cursor_update', message.data);
        break;
      case 'schema_change':
        this.emit('schema_change', message.data);
        break;
      case 'user_selection':
        this.emit('user_selection', message.data);
        break;
      case 'presence_update':
        this.emit('presence_update', message.data);
        break;
    }
  }

  sendCursorUpdate(position: CursorPosition) {
    this.sendMessage({
      type: 'cursor_update',
      data: {
        userId: this.currentUser?.id,
        position,
        timestamp: new Date().toISOString()
      }
    });
  }

  sendSchemaChange(change: SchemaChange) {
    this.sendMessage({
      type: 'schema_change',
      data: {
        ...change,
        userId: this.currentUser?.id,
        timestamp: new Date().toISOString()
      }
    });
  }

  sendUserSelection(selection: { tableId?: string; columnId?: string }) {
    this.sendMessage({
      type: 'user_selection',
      data: {
        userId: this.currentUser?.id,
        selection,
        timestamp: new Date().toISOString()
      }
    });
  }

  updatePresence(status: 'online' | 'away' | 'busy', currentAction?: string) {
    this.sendMessage({
      type: 'presence_update',
      data: {
        userId: this.currentUser?.id,
        status,
        currentAction,
        timestamp: new Date().toISOString()
      }
    });
  }

  private sendMessage(message: any) {
    // This would be implemented by the WebSocket hook
    console.log('Sending message:', message);
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
      handlers.forEach(handler => handler(data));
    }
  }

  disconnect() {
    if (this.currentUser && this.schemaId) {
      this.sendMessage({
        type: 'user_leave',
        data: {
          userId: this.currentUser.id,
          schemaId: this.schemaId
        }
      });
    }
  }

  // Operational Transform helpers for conflict resolution
  transformOperation(operation: any, otherOperation: any): any {
    // Implement operational transform logic here
    // This is a simplified version - real OT is more complex
    
    if (operation.type === 'table_update' && otherOperation.type === 'table_update') {
      if (operation.tableId === otherOperation.tableId) {
        // Same table being edited - need to merge changes
        return this.mergeTableOperations(operation, otherOperation);
      }
    }
    
    return operation;
  }

  private mergeTableOperations(op1: any, op2: any): any {
    // Simplified merge logic
    return {
      ...op1,
      data: {
        ...op1.data,
        ...op2.data,
        // Resolve conflicts by taking the latest timestamp
        lastModified: Math.max(
          new Date(op1.timestamp).getTime(),
          new Date(op2.timestamp).getTime()
        )
      }
    };
  }

  // Conflict resolution
  resolveConflict(localChange: any, remoteChange: any): any {
    // Implement conflict resolution strategy
    // For now, remote changes win (last-write-wins)
    return remoteChange;
  }

  // Presence awareness
  getActiveUsers(): CollaborationUser[] {
    // Return list of currently active users
    return [];
  }

  getUserCursor(userId: string): CursorPosition | null {
    // Return cursor position for specific user
    return null;
  }
}

export const collaborationService = new CollaborationService();
export default collaborationService;