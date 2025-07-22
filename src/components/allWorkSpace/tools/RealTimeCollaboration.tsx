import React, { useState, useEffect, useRef } from 'react';
import { 
  Users, Wifi, WifiOff, MousePointer, Eye, Edit, Crown, 
  Settings,
  // UserPlus, UserMinus,
    Shield, Activity 
} from 'lucide-react';
import { useSubscription } from '../../../context/SubscriptionContext';
import { useDatabase } from '../../../context/DatabaseContext';

interface CollaboratorCursor {
  userId: string;
  username: string;
  position: { x: number; y: number };
  selection?: {
    tableId: string;
    columnId?: string;
  };
  color: string;
  lastSeen: Date;
}

interface CollaboratorPresence {
  userId: string;
  username: string;
  role: 'admin' | 'editor' | 'viewer';
  status: 'online' | 'away' | 'offline';
  currentAction?: string;
  joinedAt: Date;
  avatar?: string;
}

interface RealtimeEvent {
  id: string;
  type: 'table_created' | 'table_updated' | 'table_deleted' | 'relationship_added' | 'user_joined' | 'user_left';
  userId: string;
  username: string;
  timestamp: Date;
  data: any;
}

const RealTimeCollaboration: React.FC = () => {
  const { currentPlan } = useSubscription();
  const { currentSchema } = useDatabase();
  
  const [isConnected, setIsConnected] = useState(false);
  const [collaborators, setCollaborators] = useState<CollaboratorPresence[]>([]);
  const [cursors, setCursors] = useState<CollaboratorCursor[]>([]);
  const [realtimeEvents, setRealtimeEvents] = useState<RealtimeEvent[]>([]);
  const [showPresencePanel, setShowPresencePanel] = useState(true);
  const [connectionQuality, setConnectionQuality] = useState<'excellent' | 'good' | 'poor'>('excellent');
  
  const wsRef = useRef<WebSocket | null>(null);
 const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
 const heartbeatIntervalRef = useRef<NodeJS.Timeout>();
  // Mock data for demonstration
  useEffect(() => {
    if (currentPlan === 'ultimate') {
      // Simulate real-time collaboration
      setIsConnected(true);
      setCollaborators([
        {
          userId: 'user1',
          username: 'alice_dev',
          role: 'editor',
          status: 'online',
          currentAction: 'Editing users table',
          joinedAt: new Date(Date.now() - 300000),
          avatar: '👩‍💻'
        },
        {
          userId: 'user2',
          username: 'bob_designer',
          role: 'viewer',
          status: 'online',
          currentAction: 'Viewing schema',
          joinedAt: new Date(Date.now() - 600000),
          avatar: '👨‍🎨'
        }
      ]);

      setCursors([
        {
          userId: 'user1',
          username: 'alice_dev',
          position: { x: 250, y: 150 },
          selection: { tableId: 'table1', columnId: 'col1' },
          color: '#3B82F6',
          lastSeen: new Date()
        }
      ]);

      setRealtimeEvents([
        {
          id: '1',
          type: 'table_created',
          userId: 'user1',
          username: 'alice_dev',
          timestamp: new Date(Date.now() - 120000),
          data: { tableName: 'users' }
        },
        {
          id: '2',
          type: 'relationship_added',
          userId: 'user1',
          username: 'alice_dev',
          timestamp: new Date(Date.now() - 60000),
          data: { source: 'orders', target: 'users' }
        }
      ]);
    }
  }, [currentPlan]);

  const initializeWebSocket = () => {
    if (currentPlan !== 'ultimate') return;

    try {
      // In a real implementation, this would connect to your WebSocket server
      const ws = new WebSocket(`ws://localhost:8080/collaboration/${currentSchema.id}`);
      
      ws.onopen = () => {
        setIsConnected(true);
        setConnectionQuality('excellent');
        
        // Send join event
        ws.send(JSON.stringify({
          type: 'user_join',
          userId: 'current_user',
          username: 'current_user',
          schemaId: currentSchema.id
        }));

        // Start heartbeat
        heartbeatIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, 30000);
      };

      ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        handleRealtimeMessage(message);
      };

      ws.onclose = () => {
        setIsConnected(false);
        if (heartbeatIntervalRef.current) {
          clearInterval(heartbeatIntervalRef.current);
        }
        
        // Attempt reconnection
        reconnectTimeoutRef.current = setTimeout(() => {
          initializeWebSocket();
        }, 5000);
      };

      ws.onerror = () => {
        setConnectionQuality('poor');
      };

      wsRef.current = ws;
    } catch (error) {
      console.error('WebSocket connection failed:', error);
      setIsConnected(false);
    }
  };

  const handleRealtimeMessage = (message: any) => {
    switch (message.type) {
      case 'user_joined':
        setCollaborators(prev => [...prev, message.user]);
        addRealtimeEvent('user_joined', message.user.userId, message.user.username, message.data);
        break;
        
      case 'user_left':
        setCollaborators(prev => prev.filter(c => c.userId !== message.userId));
        setCursors(prev => prev.filter(c => c.userId !== message.userId));
        addRealtimeEvent('user_left', message.userId, message.username, message.data);
        break;
        
      case 'cursor_update':
        setCursors(prev => {
          const existing = prev.findIndex(c => c.userId === message.userId);
          if (existing >= 0) {
            const updated = [...prev];
            updated[existing] = { ...updated[existing], ...message.cursor };
            return updated;
          }
          return [...prev, message.cursor];
        });
        break;
        
      case 'schema_change':
        // Apply schema changes from other users
        console.log('Schema change received:', message);
        addRealtimeEvent(message.changeType, message.userId, message.username, message.data);
        break;
        
      case 'pong':
        // Heartbeat response
        break;
    }
  };

  const addRealtimeEvent = (type: RealtimeEvent['type'], userId: string, username: string, data: any) => {
    const event: RealtimeEvent = {
      id: Date.now().toString(),
      type,
      userId,
      username,
      timestamp: new Date(),
      data
    };
    
    setRealtimeEvents(prev => [event, ...prev.slice(0, 49)]); // Keep last 50 events
  };

  const broadcastCursorPosition = (x: number, y: number, selection?: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'cursor_update',
        cursor: {
          userId: 'current_user',
          username: 'current_user',
          position: { x, y },
          selection,
          color: '#10B981',
          lastSeen: new Date()
        }
      }));
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online': return 'bg-green-500';
      case 'away': return 'bg-yellow-500';
      case 'offline': return 'bg-gray-500';
      default: return 'bg-gray-500';
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'admin': return <Crown className="w-4 h-4 text-purple-500" />;
      case 'editor': return <Edit className="w-4 h-4 text-blue-500" />;
      case 'viewer': return <Eye className="w-4 h-4 text-gray-500" />;
      default: return <Users className="w-4 h-4 text-gray-500" />;
    }
  };

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'table_created': return '🆕';
      case 'table_updated': return '✏️';
      case 'table_deleted': return '🗑️';
      case 'relationship_added': return '🔗';
      case 'user_joined': return '👋';
      case 'user_left': return '👋';
      default: return '📝';
    }
  };

  const formatEventMessage = (event: RealtimeEvent) => {
    switch (event.type) {
      case 'table_created':
        return `created table "${event.data.tableName}"`;
      case 'table_updated':
        return `updated table "${event.data.tableName}"`;
      case 'table_deleted':
        return `deleted table "${event.data.tableName}"`;
      case 'relationship_added':
        return `added relationship ${event.data.source} → ${event.data.target}`;
      case 'user_joined':
        return 'joined the workspace';
      case 'user_left':
        return 'left the workspace';
      default:
        return 'performed an action';
    }
  };

  // Only show for Ultimate plan users
  if (currentPlan !== 'ultimate') {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8">
        <div className="text-center max-w-md">
          <div className="w-20 h-20 bg-gradient-to-br from-purple-100 to-pink-100 dark:from-purple-900/20 dark:to-pink-900/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Users className="w-10 h-10 text-purple-600 dark:text-purple-400" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3">
            Real-Time Collaboration
          </h3>
          <p className="text-gray-500 dark:text-gray-400 mb-6 leading-relaxed">
            Live cursors, presence indicators, and real-time schema synchronization. Available exclusively in the Ultimate plan.
          </p>
          <button className="px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white rounded-xl font-medium transition-all duration-200 hover:scale-105 shadow-lg">
            Upgrade to Ultimate
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col p-4">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Real-Time Collaboration
          </h3>
          <div className="flex items-center gap-3">
            {/* Connection Status */}
            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${
              isConnected 
                ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
                : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
            }`}>
              {isConnected ? (
                <Wifi className="w-4 h-4" />
              ) : (
                <WifiOff className="w-4 h-4" />
              )}
              <span className="text-sm font-medium">
                {isConnected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
            
            {/* Settings */}
            <button
              onClick={() => setShowPresencePanel(!showPresencePanel)}
              className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors duration-200"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Connection Quality */}
        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
          <Activity className="w-4 h-4" />
          <span>Connection quality: </span>
          <span className={`font-medium ${
            connectionQuality === 'excellent' ? 'text-green-600' :
            connectionQuality === 'good' ? 'text-yellow-600' : 'text-red-600'
          }`}>
            {connectionQuality}
          </span>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Active Collaborators */}
        <div className="space-y-4">
          <h4 className="text-md font-medium text-gray-900 dark:text-white">
            Active Collaborators ({collaborators.length})
          </h4>
          
          <div className="space-y-3">
            {collaborators.map(collaborator => (
              <div
                key={collaborator.userId}
                className="flex items-center gap-3 p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg"
              >
                <div className="relative">
                  <div className="w-10 h-10 bg-gradient-to-br from-blue-100 to-purple-100 dark:from-blue-900/20 dark:to-purple-900/20 rounded-full flex items-center justify-center text-lg">
                    {collaborator.avatar || '👤'}
                  </div>
                  <div className={`absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-white dark:border-gray-800 ${getStatusColor(collaborator.status)}`} />
                </div>
                
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900 dark:text-white">
                      {collaborator.username}
                    </span>
                    {getRoleIcon(collaborator.role)}
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    {collaborator.currentAction || 'Viewing workspace'}
                  </div>
                  <div className="text-xs text-gray-400">
                    Joined {collaborator.joinedAt.toLocaleTimeString()}
                  </div>
                </div>
                
                <div className="flex items-center gap-1">
                  {collaborator.status === 'online' && (
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Live Cursors Info */}
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <MousePointer className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span className="font-medium text-blue-800 dark:text-blue-200">Live Cursors</span>
            </div>
            <div className="text-sm text-blue-700 dark:text-blue-300">
              {cursors.length} active cursor{cursors.length !== 1 ? 's' : ''} on canvas
            </div>
            {cursors.map(cursor => (
              <div key={cursor.userId} className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                {cursor.username} {cursor.selection ? `editing ${cursor.selection.tableId}` : 'browsing'}
              </div>
            ))}
          </div>
        </div>

        {/* Real-time Activity Feed */}
        <div className="space-y-4">
          <h4 className="text-md font-medium text-gray-900 dark:text-white">
            Live Activity Feed
          </h4>
          
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {realtimeEvents.map(event => (
              <div
                key={event.id}
                className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
              >
                <div className="text-lg">{getEventIcon(event.type)}</div>
                <div className="flex-1">
                  <div className="text-sm">
                    <span className="font-medium text-gray-900 dark:text-white">
                      {event.username}
                    </span>
                    <span className="text-gray-600 dark:text-gray-400 ml-1">
                      {formatEventMessage(event)}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {event.timestamp.toLocaleTimeString()}
                  </div>
                </div>
              </div>
            ))}
            
            {realtimeEvents.length === 0 && (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                <Activity className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No recent activity</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Collaboration Features */}
      <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/10 dark:to-emerald-900/10 border border-green-200 dark:border-green-800 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Wifi className="w-4 h-4 text-green-600 dark:text-green-400" />
            <span className="font-medium text-green-800 dark:text-green-200">Real-time Sync</span>
          </div>
          <div className="text-sm text-green-700 dark:text-green-300">
            Changes sync instantly across all connected users
          </div>
        </div>
        
        <div className="bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-900/10 dark:to-cyan-900/10 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <MousePointer className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span className="font-medium text-blue-800 dark:text-blue-200">Live Cursors</span>
          </div>
          <div className="text-sm text-blue-700 dark:text-blue-300">
            See where others are working in real-time
          </div>
        </div>
        
        <div className="bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/10 dark:to-pink-900/10 border border-purple-200 dark:border-purple-800 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Shield className="w-4 h-4 text-purple-600 dark:text-purple-400" />
            <span className="font-medium text-purple-800 dark:text-purple-200">Secure Access</span>
          </div>
          <div className="text-sm text-purple-700 dark:text-purple-300">
            Role-based permissions and encrypted connections
          </div>
        </div>
      </div>
    </div>
  );
};

export default RealTimeCollaboration;