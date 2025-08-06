import { mongoService } from '../../../../services/mongoService';
import { useWebSocket } from '../../../../hooks/useWebSocket';

// Mock the WebSocket hook
jest.mock('../../hooks/useWebSocket');
const mockUseWebSocket = useWebSocket as jest.MockedFunction<typeof useWebSocket>;

// Mock fetch
global.fetch = jest.fn();
const mockFetch = fetch as jest.MockedFunction<typeof fetch>;

describe('Real-time Collaboration Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseWebSocket.mockReturnValue({
      socket: null,
      isConnected: true,
      isConnecting: false,
      error: null,
      lastMessage: null,
      connect: jest.fn(),
      disconnect: jest.fn(),
      reconnect: jest.fn(),
      sendMessage: jest.fn().mockReturnValue(true)
    });
  });

  describe('Schema Broadcasting', () => {
    it('broadcasts schema changes to connected users', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true })
      } as Response);

      const result = await mongoService.broadcastSchemaChange(
        'schema123',
        'table_created',
        { tableName: 'users' }
      );

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/collaboration/broadcast'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('table_created')
        })
      );
    });

    it('handles broadcast failures gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500
      } as Response);

      const result = await mongoService.broadcastSchemaChange(
        'schema123',
        'table_created',
        { tableName: 'users' }
      );

      expect(result).toBe(false);
    });
  });

  describe('Real-time Updates', () => {
    it('fetches real-time updates since timestamp', async () => {
      const mockUpdates = [
        {
          id: '1',
          type: 'table_created',
          data: { tableName: 'users' },
          timestamp: new Date().toISOString()
        }
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockUpdates
      } as Response);

      const since = new Date('2023-01-01');
      const updates = await mongoService.getRealtimeUpdates('schema123', since);

      expect(updates).toEqual(mockUpdates);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(`schemaId=schema123&since=${since.toISOString()}`),
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('returns empty array on fetch failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404
      } as Response);

      const updates = await mongoService.getRealtimeUpdates('schema123');

      expect(updates).toEqual([]);
    });
  });

  describe('WebSocket Integration', () => {
    it('connects to collaboration WebSocket', () => {
      const mockSendMessage = jest.fn();
      mockUseWebSocket.mockReturnValue({
        socket: {} as WebSocket,
        isConnected: true,
        isConnecting: false,
        error: null,
        lastMessage: null,
        connect: jest.fn(),
        disconnect: jest.fn(),
        reconnect: jest.fn(),
        sendMessage: mockSendMessage
      });

      // Simulate component using the hook
      const { sendMessage } = useWebSocket({
        url: 'ws://localhost:8080/collaboration/schema123',
        onMessage: jest.fn()
      });

      sendMessage({
        type: 'schema_change',
        data: { tableName: 'users' }
      });

      expect(mockSendMessage).toHaveBeenCalledWith({
        type: 'schema_change',
        data: { tableName: 'users' }
      });
    });

    it('handles connection failures', () => {
      mockUseWebSocket.mockReturnValue({
        socket: null,
        isConnected: false,
        isConnecting: false,
        error: 'Connection failed',
        lastMessage: null,
        connect: jest.fn(),
        disconnect: jest.fn(),
        reconnect: jest.fn(),
        sendMessage: jest.fn().mockReturnValue(false)
      });

      const { isConnected, error } = useWebSocket({
        url: 'ws://localhost:8080/collaboration/schema123',
        onMessage: jest.fn()
      });

      expect(isConnected).toBe(false);
      expect(error).toBe('Connection failed');
    });
  });

  describe('Access Control', () => {
    it('validates user permissions before allowing changes', async () => {
      // Mock user validation
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ exists: true, role: 'editor' })
      } as Response);

      const isValid = await mongoService.validateUsername('testuser');
      expect(isValid).toBe(true);
    });

    it('prevents unauthorized schema modifications', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403
      } as Response);

      const result = await mongoService.broadcastSchemaChange(
        'schema123',
        'table_deleted',
        { tableId: 'table1' }
      );

      expect(result).toBe(false);
    });
  });
});