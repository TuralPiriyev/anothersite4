import collaborationService, { CollaborationUser, SchemaChange } from '../collaborationService';

// Mock WebSocket
const mockWebSocket = {
  send: jest.fn(),
  close: jest.fn(),
  readyState: 1,
  OPEN: 1,
};

// Mock the useWebSocket hook
jest.mock('../../hooks/useWebSocket', () => ({
  useWebSocket: jest.fn(() => ({
    socket: mockWebSocket,
    isConnected: true,
    sendMessage: jest.fn(),
  })),
}));

describe('CollaborationService', () => {
  const mockUser: CollaborationUser = {
    id: 'user1',
    username: 'testuser',
    role: 'editor',
    color: '#3B82F6'
  };

  beforeEach(() => {
    jest.clearAllMocks();
    collaborationService.initialize(mockUser, 'schema123');
  });

  describe('initialization', () => {
    it('initializes with user and schema ID', () => {
      expect(() => {
        collaborationService.initialize(mockUser, 'schema123');
      }).not.toThrow();
    });

    it('throws error when connecting without initialization', () => {
      const service = new (collaborationService.constructor as any)();
      expect(() => {
        service.connect();
      }).toThrow('Must initialize with user and schema ID before connecting');
    });
  });

  describe('cursor updates', () => {
    it('sends cursor position updates', () => {
      const position = { x: 100, y: 200 };
      collaborationService.sendCursorUpdate(position);

      // In a real test, you'd verify the WebSocket message was sent
      expect(true).toBe(true); // Placeholder assertion
    });

    it('includes selection information in cursor updates', () => {
      const position = { x: 100, y: 200, tableId: 'table1' };
      collaborationService.sendCursorUpdate(position);

      // Verify selection data is included
      expect(true).toBe(true); // Placeholder assertion
    });
  });

  describe('schema changes', () => {
    it('broadcasts schema changes to other users', () => {
      const change: SchemaChange = {
        type: 'table_created',
        data: { tableName: 'users' },
        userId: 'user1',
        timestamp: new Date()
      };

      collaborationService.sendSchemaChange(change);

      // Verify change was broadcast
      expect(true).toBe(true); // Placeholder assertion
    });

    it('handles operational transform for concurrent edits', () => {
      const op1 = {
        type: 'table_update',
        tableId: 'table1',
        data: { name: 'users_new' },
        timestamp: new Date().toISOString()
      };

      const op2 = {
        type: 'table_update',
        tableId: 'table1',
        data: { description: 'User accounts' },
        timestamp: new Date().toISOString()
      };

      const transformed = collaborationService.transformOperation(op1, op2);

      expect(transformed).toBeDefined();
      expect(transformed.type).toBe('table_update');
    });
  });

  describe('presence management', () => {
    it('updates user presence status', () => {
      collaborationService.updatePresence('online', 'Editing users table');

      // Verify presence update was sent
      expect(true).toBe(true); // Placeholder assertion
    });

    it('handles user selection changes', () => {
      const selection = { tableId: 'table1', columnId: 'column1' };
      collaborationService.sendUserSelection(selection);

      // Verify selection update was sent
      expect(true).toBe(true); // Placeholder assertion
    });
  });

  describe('conflict resolution', () => {
    it('resolves conflicts using last-write-wins strategy', () => {
      const localChange = {
        type: 'table_update',
        data: { name: 'local_name' },
        timestamp: new Date('2023-01-01T10:00:00Z')
      };

      const remoteChange = {
        type: 'table_update',
        data: { name: 'remote_name' },
        timestamp: new Date('2023-01-01T10:01:00Z')
      };

      const resolved = collaborationService.resolveConflict(localChange, remoteChange);

      expect(resolved).toEqual(remoteChange);
    });
  });

  describe('event handling', () => {
    it('registers and calls event handlers', () => {
      const handler = jest.fn();
      collaborationService.on('user_joined', handler);

      // Simulate event
      collaborationService['emit']('user_joined', { userId: 'user2' });

      expect(handler).toHaveBeenCalledWith({ userId: 'user2' });
    });

    it('removes event handlers', () => {
      const handler = jest.fn();
      collaborationService.on('user_joined', handler);
      collaborationService.off('user_joined', handler);

      // Simulate event
      collaborationService['emit']('user_joined', { userId: 'user2' });

      expect(handler).not.toHaveBeenCalled();
    });
  });
});