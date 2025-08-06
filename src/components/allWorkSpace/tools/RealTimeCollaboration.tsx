import React, { useState, useEffect, useRef } from 'react';
import { 
  Users, Wifi, WifiOff, MousePointer, Eye, Edit, Crown, 
  Settings, Shield, Activity, Send, UserPlus, Copy, Check, X, Clock, Globe, Lock, AlertCircle
} from 'lucide-react';
import { useSubscription } from '../../../context/SubscriptionContext';
import { useDatabase } from '../../../context/DatabaseContext';
import { collaborationService, CollaborationUser } from '../../../services/collaborationService';
import { mongoService } from '../../../services/mongoService';
import api from '../../../utils/api';

 const getRoleBadgeColor = (role: CollaboratorPresence['role']): string => {
  switch (role) {

    case 'admin':  return 'bg-purple-100 text-purple-800';
    case 'editor': return 'bg-blue-100   text-blue-800';
    case 'viewer': return 'bg-gray-100   text-gray-800';
    default:       return 'bg-gray-100   text-gray-800';
  }
};
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

interface CollaborationStatus {
  isConnected: boolean;
  lastSync: string;
  activeUsers: number;
}
interface CollaboratorPresence {
  userId: string;
  username: string;
  role: 'owner' | 'admin' | 'editor' | 'viewer';
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
  timestamp: string;
  data: any;
}

const RealTimeCollaboration: React.FC = () => {
  const { currentPlan } = useSubscription();
  const { 
    currentSchema, 
    inviteToWorkspace,
    acceptWorkspaceInvitation,
    removeWorkspaceMember,
    syncWorkspaceWithMongoDB,
    addTable,
    updateTable,
    removeTable
  } = useDatabase();
  
const [collaborationStatus, setCollaborationStatus] = useState<CollaborationStatus>({
  isConnected: false,
  lastSync: new Date().toISOString(),
  activeUsers: 0
});

  const [isConnected, setIsConnected] = useState(false);
  const [collaborators, setCollaborators] = useState<CollaboratorPresence[]>([]);
  const [cursors, setCursors] = useState<CollaboratorCursor[]>([]);
  const [realtimeEvents, setRealtimeEvents] = useState<RealtimeEvent[]>([]);
  const [showPresencePanel, setShowPresencePanel] = useState(true);
  const [connectionQuality, setConnectionQuality] = useState<'excellent' | 'good' | 'poor'>('excellent');
  
  // State for invitation form
  const [inviteUsername, setInviteUsername] = useState('');
  const [inviteRole, setInviteRole] = useState<'editor' | 'viewer'>('editor');
  const [isInviting, setIsInviting] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [inviteSuccess, setInviteSuccess] = useState('');
  const [generatedCode, setGeneratedCode] = useState('');
  
  // State for accepting invitations
  const [joinCode, setJoinCode] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [joinError, setJoinError] = useState('');
  const [joinSuccess, setJoinSuccess] = useState('');
  
  // State for active tab
  const [activeTab, setActiveTab] = useState<'invite' | 'accept' | 'members'>('invite');
  
  // State for copied code feedback
  const [copiedCode, setCopiedCode] = useState('');
  
  // Monitor collaboration service status (don't create new connection)
  useEffect(() => {
    if (currentPlan !== 'ultimate' || !currentSchema?.id) {
      setIsConnected(false);
      // Dispatch disconnection event to MainLayout
      window.dispatchEvent(new CustomEvent('collaboration-event', {
        detail: { type: 'connection_status', data: { connected: false } }
      }));
      return;
    }

    // Initialize collaboration service for this component
    const initializeCollaboration = async () => {
      try {
        // Create a demo user for collaboration
        const demoUser: CollaborationUser = {
          id: `user_${Date.now()}`,
          username: `user_${Math.random().toString(36).substr(2, 8)}`,
          role: 'editor',
          color: `hsl(${Math.random() * 360}, 70%, 50%)`
        };

        // Initialize and connect collaboration service
        collaborationService.initialize(demoUser, currentSchema.id);

        // Set up event handlers for this component's state
        const handleConnected = () => {
          setIsConnected(true);
          setConnectionQuality('excellent');
          setCollaborationStatus(prev => ({
            ...prev,
            isConnected: true,
            lastSync: new Date().toISOString()
          }));
          
          // Dispatch connection event to MainLayout
          window.dispatchEvent(new CustomEvent('collaboration-event', {
            detail: { type: 'connection_status', data: { connected: true } }
          }));
        };

        const handleDisconnected = () => {
          setIsConnected(false);
          setCollaborationStatus(prev => ({ ...prev, isConnected: false }));
          
          // Dispatch disconnection event to MainLayout
          window.dispatchEvent(new CustomEvent('collaboration-event', {
            detail: { type: 'connection_status', data: { connected: false } }
          }));
        };

        const handleUserJoined = (user: CollaborationUser) => {
          console.log('👋 User joined collaboration:', user.username);
          addRealtimeEvent('user_joined', user.id, user.username, user);
          
          setCollaborators(prev => {
            const exists = prev.find(c => c.userId === user.id);
            if (!exists) {
              return [...prev, {
                userId: user.id,
                username: user.username,
                role: user.role as any,
                status: 'online' as const,
                currentAction: 'Working on schema',
                joinedAt: new Date()
              }];
            }
            return prev;
          });
        };

        const handleUserLeft = (userId: string) => {
          console.log('👋 User left collaboration:', userId);
          setCollaborators(prev => prev.filter(c => c.userId !== userId));
          setCursors(prev => prev.filter(c => c.userId !== userId));
          addRealtimeEvent('user_left', userId, 'User', {});
          
          // Dispatch user left event to MainLayout
          window.dispatchEvent(new CustomEvent('collaboration-event', {
            detail: { type: 'user_left', data: { userId } }
          }));
        };

        const handleCursorUpdate = (cursor: any) => {
          if (cursor && 
              typeof cursor === 'object' && 
              cursor.userId && 
              typeof cursor.userId === 'string') {
            setCursors(prev => {
              const existing = prev.findIndex(c => c.userId === cursor.userId);
              const cursorData = {
                userId: cursor.userId,
                username: cursor.username || 'Unknown',
                position: cursor.position || { x: 0, y: 0 },
                selection: cursor.selection,
                color: cursor.color || '#3B82F6',
                lastSeen: new Date(cursor.lastSeen || Date.now())
              };

              if (existing >= 0) {
                const updated = [...prev];
                updated[existing] = cursorData;
                return updated;
              }
              return [...prev, cursorData];
            });
            
            // Dispatch cursor update event to MainLayout
            window.dispatchEvent(new CustomEvent('collaboration-event', {
              detail: { type: 'cursor_update', data: cursor }
            }));
          } else {
            console.warn('⚠️ Invalid cursor data in RealTimeCollaboration:', cursor);
          }
        };

        const handleSchemaChange = (message: any) => {
          console.log('🔄 Schema change received:', message);
          handleSchemaChangeEvent(message);
          addRealtimeEvent(message.changeType, message.userId, message.username || 'User', message.data);
        };

        const handleError = (error: any) => {
          console.error('❌ Collaboration error:', error);
          setConnectionQuality('poor');
        };

        // Register event handlers
        collaborationService.on('connected', handleConnected);
        collaborationService.on('disconnected', handleDisconnected);
        collaborationService.on('user_joined', handleUserJoined);
        collaborationService.on('user_left', handleUserLeft);
        collaborationService.on('cursor_update', handleCursorUpdate);
        collaborationService.on('schema_change', handleSchemaChange);
        collaborationService.on('error', handleError);

        // Connect to collaboration service
        await collaborationService.connect();

        // Cleanup
        return () => {
          collaborationService.off('connected', handleConnected);
          collaborationService.off('disconnected', handleDisconnected);
          collaborationService.off('user_joined', handleUserJoined);
          collaborationService.off('user_left', handleUserLeft);
          collaborationService.off('cursor_update', handleCursorUpdate);
          collaborationService.off('schema_change', handleSchemaChange);
          collaborationService.off('error', handleError);
          collaborationService.disconnect();
        };

      } catch (error) {
        console.error('Failed to initialize collaboration:', error);
        setIsConnected(false);
        setConnectionQuality('poor');
        
        // Dispatch error connection event to MainLayout
        window.dispatchEvent(new CustomEvent('collaboration-event', {
          detail: { type: 'connection_status', data: { connected: false } }
        }));
      }
    };

    // Small delay to prevent connection spam
    const timeoutId = setTimeout(initializeCollaboration, 500);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [currentPlan, currentSchema?.id]);

  // Listen for cursor move events from MainLayout
  useEffect(() => {
    const handleCursorMove = (event: CustomEvent) => {
      const { position } = event.detail;
      if (position && isConnected && collaborationService.isConnectedState()) {
        collaborationService.sendCursorUpdate(position);
      }
    };

    window.addEventListener('cursor-move', handleCursorMove as EventListener);

    return () => {
      window.removeEventListener('cursor-move', handleCursorMove as EventListener);
    };
  }, [isConnected]);

  // Real database collaboration functions
  const handleSendInvitation = async () => {
    if (!inviteUsername.trim()) {
      setInviteError('Please enter a username');
      return;
    }

    setIsInviting(true);
    setInviteError('');
    setInviteSuccess('');

    try {
      // Validate username against real database
      const response = await api.post('/users/validate', { username: inviteUsername });
      
      if (!response.data.exists) {
        setInviteError('User not found in our database.');
        setIsInviting(false);
        return;
      }

      // Check if user is already invited or a member
      const existingInvite = currentSchema.invitations.find(
        inv => inv.inviteeUsername.toLowerCase() === inviteUsername.toLowerCase() && inv.status === 'pending'
      );
      const existingMember = currentSchema.members.find(
        member => member.username.toLowerCase() === inviteUsername.toLowerCase()
      );

      if (existingInvite) {
        setInviteError('User already has a pending invitation.');
        setIsInviting(false);
        return;
      }

      if (existingMember) {
        setInviteError('User is already a team member.');
        setIsInviting(false);
        return;
      }

      // Generate join code
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      let joinCode = '';
      for (let i = 0; i < 8; i++) {
        joinCode += chars.charAt(Math.floor(Math.random() * chars.length));
      }

      // Save to real MongoDB
      const invitationResponse = await api.post('/invitations', {
        workspaceId: currentSchema.id,
        inviterUsername: 'current_user',
        inviteeUsername: inviteUsername,
        role: inviteRole,
        joinCode,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        status: 'pending'
      });

      if (invitationResponse.data) {
        setGeneratedCode(joinCode);
        setInviteSuccess(`Invitation sent successfully! Share this join code with ${inviteUsername}:`);
        
        // Reset form
        setInviteUsername('');
        setInviteRole('editor');
      } else {
        setInviteError('Failed to create invitation. Please try again.');
      }
      
    } catch (error: any) {
      const errorMessage = error.response?.data?.error || 'Failed to send invitation. Please try again.';
      setInviteError(errorMessage);
      console.error('Invitation error:', error);
    } finally {
      setIsInviting(false);
    }
  };

  const handleAcceptInvitation = async () => {
    if (!joinCode.trim()) {
      setJoinError('Please enter a join code');
      return;
    }

    setIsJoining(true);
    setJoinError('');
    setJoinSuccess('');

    try {
      // Validate join code with real database
      const response = await api.post('/invitations/validate', { joinCode: joinCode.toUpperCase() });
      
      if (!response.data.valid) {
        setJoinError(response.data.error || 'Invalid or expired code.');
        setIsJoining(false);
        return;
      }

      const invitation = response.data.invitation;
      
      // Update invitation status in database
      await api.put(`/invitations/${invitation.id}`, { status: 'accepted' });

      // Add member to database
      const memberResponse = await api.post('/members', {
        workspaceId: invitation.workspaceId,
        id: crypto.randomUUID(),
        username: invitation.inviteeUsername,
        role: invitation.role,
        joinedAt: new Date().toISOString()
      });

      if (memberResponse.data) {
        setJoinSuccess(`Successfully joined the workspace! You now have ${invitation.role} access.`);
        setJoinCode('');
        
        // Switch to members tab to show the new member
        setTimeout(() => setActiveTab('members'), 2000);
      } else {
        setJoinError('Failed to join workspace.');
      }
      
    } catch (error: any) {
      const errorMessage = error.response?.data?.error || 'Failed to accept invitation. Please try again.';
      setJoinError(errorMessage);
      console.error('Join error:', error);
    } finally {
      setIsJoining(false);
    }
  };

  // Enhanced copy function with feedback
  const copyJoinCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(''), 2000);
    } catch (error) {
      console.error('Failed to copy code:', error);
    }
  };

  // Enhanced member removal with real database sync
  const removeMember = async (memberId: string) => {
    const member = currentSchema.members.find(m => m.id === memberId);
    if (!member) return;

    if (confirm(`Are you sure you want to remove ${member.username} from the workspace?`)) {
      removeWorkspaceMember(memberId);
      
      // Update real database
      try {
        await api.delete(`/api/members/${memberId}`);
        await syncWorkspaceWithMongoDB();
      } catch (error) {
        console.error('Failed to update database:', error);
      }
    }
  };

  const handleSchemaChangeEvent = (message: any) => {
    const { changeType, data } = message;
    
    switch (changeType) {
      case 'table_created':
        if (data.table) {
          addTable(data.table);
        }
        break;
      case 'table_updated':
        if (data.tableId && data.updates) {
          updateTable(data.tableId, data.updates);
        }
        break;
      case 'table_deleted':
        if (data.tableId) {
          removeTable(data.tableId);
        }
        break;
      case 'relationship_added':
        // Handle relationship changes
        break;
    }
    
    // Sync with MongoDB
    syncWorkspaceWithMongoDB();
  };

  const addRealtimeEvent = (type: RealtimeEvent['type'], userId: string, username: string, data: any) => {
    const event: RealtimeEvent = {
      id: Date.now().toString(),
      type,
      userId,
      username,
      timestamp:  new Date().toISOString(),
      data
    };
    
    setRealtimeEvents(prev => [event, ...prev.slice(0, 49)]); // Keep last 50 events
  };

  const broadcastCursorPosition = (x: number, y: number, selection?: any) => {
    if (isConnected && collaborationService.isConnectedState()) {
      collaborationService.sendCursorUpdate({
        x,
        y,
        tableId: selection?.tableId,
        columnId: selection?.columnId
      });
    }
  };
  
  const broadcastSchemaChange = (changeType: string, data: any) => {
    if (isConnected && collaborationService.isConnectedState()) {
      collaborationService.sendSchemaChange({
        type: changeType as any,
        data,
        userId: 'current_user',
        timestamp: new Date()
      });
    }
  };

 

  // Real-time workspace synchronization
  useEffect(() => {
    if (currentPlan === 'ultimate' && currentSchema.isShared) {
      const syncInterval = setInterval(async () => {
        try {
          // Fetch latest workspace data from MongoDB
          const workspaceMembers = await mongoService.getWorkspaceMembers(currentSchema.id);
          const workspaceInvitations = await mongoService.getWorkspaceInvitations(currentSchema.id);
          
          // Update local state with fresh data
          setCollaborators(workspaceMembers.map(member => ({
            userId: member.id,
            username: member.username,
            role: member.role as 'admin' | 'editor' | 'viewer',
            status: 'online' as const,
            currentAction: 'Working on schema',
            joinedAt: member.joinedAt
          })));
          
         setCollaborationStatus(prev => ({
  ...prev,
  isConnected: true,
  lastSync: new Date().toISOString(),
  activeUsers: workspaceMembers.length
}));
        } catch (error) {
          console.error('Failed to sync workspace:', error);
          setCollaborationStatus(prev => ({
            ...prev,
            isConnected: false
          }));
        }
      }, 10000); // Sync every 10 seconds

      return () => clearInterval(syncInterval);
    }
  }, [currentPlan, currentSchema.isShared, currentSchema.id]);

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
            
            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
              <Users className="w-4 h-4" />
              <span>{collaborators.length} active</span>
            </div>
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

        {/* Enhanced Tabs */}
        <div className="border-b border-gray-200 dark:border-gray-700 mt-6">
          <nav className="flex space-x-8">
            {[
              { id: 'invite', name: 'Send Invitation', icon: UserPlus, color: 'text-blue-600 dark:text-blue-400' },
              { id: 'accept', name: 'Accept Invitation', icon: Send, color: 'text-green-600 dark:text-green-400' },
              { id: 'members', name: 'Team Members', icon: Users, color: 'text-purple-600 dark:text-purple-400' }
            ].map(tab => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`
                    flex items-center gap-2 py-3 px-1 border-b-2 font-medium text-sm transition-all duration-200
                    ${activeTab === tab.id
                      ? `border-purple-500 ${tab.color} bg-purple-50 dark:bg-purple-900/10 px-3 rounded-t-lg`
                      : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800/50 px-3 rounded-t-lg'
                    }
                  `}
                >
                  <Icon className="w-4 h-4" />
                  {tab.name}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Send Invitation Tab */}
        {activeTab === 'invite' && (
          <div className="space-y-6">
            <div className="bg-gradient-to-br from-white to-blue-50 dark:from-gray-800 dark:to-blue-900/10 border border-gray-200 dark:border-gray-700 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900/20 rounded-lg flex items-center justify-center">
                  <UserPlus className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                </div>
                <h4 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Invite New Team Member
                </h4>
              </div>
              
              <div className="space-y-5">
                {/* Username Input */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Username
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={inviteUsername}
                      onChange={(e) => setInviteUsername(e.target.value)}
                      className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all duration-200"
                      placeholder="Enter username to invite"
                      disabled={isInviting}
                    />
                    {isInviting && (
                      <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                        <div className="w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Role Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Role & Permissions
                  </label>
                  <div className="grid grid-cols-1 gap-3">
                    {[
                      { value: 'editor', label: 'Editor', desc: 'Can modify tables, data, and workspace settings', icon: '✏️' },
                      { value: 'viewer', label: 'Viewer', desc: 'Can only view the workspace, no editing permissions', icon: '👁️' }
                    ].map(role => (
                      <label key={role.value} className="relative">
                        <input
                          type="radio"
                          name="role"
                          value={role.value}
                          checked={inviteRole === role.value}
                          onChange={(e) => setInviteRole(e.target.value as 'editor' | 'viewer')}
                          className="sr-only"
                          disabled={isInviting}
                        />
                        <div className={`
                          p-4 border-2 rounded-xl cursor-pointer transition-all duration-200
                          ${inviteRole === role.value
                            ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                            : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                          }
                        `}>
                          <div className="flex items-start gap-3">
                            <span className="text-lg">{role.icon}</span>
                            <div className="flex-1">
                              <div className="font-medium text-gray-900 dark:text-white">{role.label}</div>
                              <div className="text-sm text-gray-500 dark:text-gray-400">{role.desc}</div>
                            </div>
                            {inviteRole === role.value && (
                              <Check className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                            )}
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Send Button */}
                <button
                  onClick={handleSendInvitation}
                  disabled={isInviting || !inviteUsername.trim()}
                  className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 disabled:from-gray-400 disabled:to-gray-500 text-white rounded-xl transition-all duration-200 font-medium shadow-lg hover:shadow-xl disabled:shadow-none hover:scale-[1.02] disabled:scale-100"
                >
                  {isInviting ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Validating User...
                    </>
                  ) : (
                    <>
                      <Send className="w-5 h-5" />
                      Send Invitation
                    </>
                  )}
                </button>

                {/* Error Message */}
                {inviteError && (
                  <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
                      <p className="text-red-800 dark:text-red-200 text-sm font-medium">Error</p>
                    </div>
                    <p className="text-red-700 dark:text-red-300 text-sm mt-1">{inviteError}</p>
                  </div>
                )}

                {/* Success Message */}
                {inviteSuccess && (
                  <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl">
                    <div className="flex items-center gap-2 mb-2">
                      <Check className="w-4 h-4 text-green-600 dark:text-green-400" />
                      <p className="text-green-800 dark:text-green-200 text-sm font-medium">Success!</p>
                    </div>
                    <p className="text-green-700 dark:text-green-300 text-sm mb-3">{inviteSuccess}</p>
                    {generatedCode && (
                      <div className="bg-green-100 dark:bg-green-800/20 rounded-lg p-3">
                        <div className="flex items-center justify-between">
                          <code className="text-lg font-mono font-bold text-green-800 dark:text-green-200">
                            {generatedCode}
                          </code>
                          <button
                            onClick={() => copyJoinCode(generatedCode)}
                            className="p-2 text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-200 hover:bg-green-200 dark:hover:bg-green-700/20 rounded-lg transition-colors duration-200"
                            title="Copy join code"
                          >
                            {copiedCode === generatedCode ? (
                              <Check className="w-4 h-4" />
                            ) : (
                              <Copy className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                        <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                          Code expires in 24 hours
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Accept Invitation Tab */}
        {activeTab === 'accept' && (
          <div className="space-y-6">
            <div className="bg-gradient-to-br from-white to-green-50 dark:from-gray-800 dark:to-green-900/10 border border-gray-200 dark:border-gray-700 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-8 h-8 bg-green-100 dark:bg-green-900/20 rounded-lg flex items-center justify-center">
                  <Send className="w-4 h-4 text-green-600 dark:text-green-400" />
                </div>
                <h4 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Join a Workspace
                </h4>
              </div>
              
              <div className="space-y-5">
                {/* Join Code Input */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Join Code
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={joinCode}
                      onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                      className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500 focus:border-green-500 font-mono text-lg tracking-wider text-center transition-all duration-200"
                      placeholder="XXXXXXXX"
                      maxLength={8}
                      disabled={isJoining}
                    />
                    {isJoining && (
                      <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                        <div className="w-5 h-5 border-2 border-green-500 border-t-transparent rounded-full animate-spin"></div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Join Button */}
                <button
                  onClick={handleAcceptInvitation}
                  disabled={isJoining || !joinCode.trim() || joinCode.length !== 8}
                  className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 disabled:from-gray-400 disabled:to-gray-500 text-white rounded-xl transition-all duration-200 font-medium shadow-lg hover:shadow-xl disabled:shadow-none hover:scale-[1.02] disabled:scale-100"
                >
                  {isJoining ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Joining Workspace...
                    </>
                  ) : (
                    <>
                      <Check className="w-5 h-5" />
                      Join Workspace
                    </>
                  )}
                </button>

                {/* Error/Success Messages */}
                {joinError && (
                  <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
                      <p className="text-red-800 dark:text-red-200 text-sm font-medium">Error</p>
                    </div>
                    <p className="text-red-700 dark:text-red-300 text-sm mt-1">{joinError}</p>
                  </div>
                )}

                {joinSuccess && (
                  <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl">
                    <div className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-green-600 dark:text-green-400" />
                      <p className="text-green-800 dark:text-green-200 text-sm font-medium">Welcome!</p>
                    </div>
                    <p className="text-green-700 dark:text-green-300 text-sm mt-1">{joinSuccess}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Team Members Tab */}
        {activeTab === 'members' && (
          <div className="space-y-6">
            <div className="bg-gradient-to-br from-white to-purple-50 dark:from-gray-800 dark:to-purple-900/10 border border-gray-200 dark:border-gray-700 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-purple-100 dark:bg-purple-900/20 rounded-lg flex items-center justify-center">
                    <Users className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  </div>
                  <h4 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Team Members ({currentSchema.members.length})
                  </h4>
                </div>
              </div>
              
              <div className="space-y-3">
                {currentSchema.members.map(member => (
                  <div key={member.id} className="flex items-center justify-between p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl hover:shadow-md transition-all duration-200">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-gradient-to-br from-purple-100 to-pink-100 dark:from-purple-900/20 dark:to-pink-900/20 rounded-full flex items-center justify-center">
                        <Users className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-gray-900 dark:text-white">
                            {member.username}
                          </p>
                          {member.username === 'current_user' && (
                            <span className="text-xs bg-blue-100 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200 px-2 py-1 rounded-full">
                              You
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          Joined {member.joinedAt.toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`px-3 py-1 text-xs font-medium rounded-full ${getRoleBadgeColor(member.role)}`}>
                        {member.role}
                        {member.role === 'owner' && <Crown className="w-3 h-3 inline ml-1" />}
                      </span>
                      {member.role !== 'owner' && member.username !== 'current_user' && (
                        <button
                          onClick={() => removeMember(member.id)}
                          className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors duration-200"
                          title="Remove member"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Collaboration Features */}
      <div className="mt-6 grid grid-cols-1 gap-4">
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

      {/* Live Cursors Overlay */}
      <div style={{ pointerEvents: 'none', position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 50 }}>
        {cursors.map(cursor => (
          <div
            key={cursor.userId}
            style={{
              position: 'absolute',
              left: cursor.position.x,
              top: cursor.position.y,
              transform: 'translate(-50%, -50%)',
              zIndex: 100,
              pointerEvents: 'none',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            {/* Cursor Icon */}
            <svg width="18" height="18" viewBox="0 0 24 24" fill={cursor.color} style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.15))' }}>
              <path d="M2 2l20 7-9 2-2 9z" />
            </svg>
            {/* Username Label */}
            <span
              style={{
                marginLeft: 6,
                background: 'rgba(255,255,255,0.95)',
                color: cursor.color,
                fontWeight: 600,
                fontSize: 13,
                borderRadius: 6,
                padding: '2px 8px',
                boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
                border: `1px solid ${cursor.color}`,
                whiteSpace: 'nowrap',
                pointerEvents: 'none',
              }}
            >
              {cursor.username}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default RealTimeCollaboration;
