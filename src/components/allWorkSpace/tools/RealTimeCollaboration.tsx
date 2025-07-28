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
    case 'owner': return 'bg-purple-100 text-purple-800';
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
  color: string;
  isOnline: boolean;
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
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Initialize collaboration when component mounts
  useEffect(() => {
    if (currentSchema && currentSchema.id) {
      initializeCollaboration();
    }

    return () => {
      // Cleanup on unmount
      collaborationService.disconnect();
    };
  }, [currentSchema?.id]);

  const initializeCollaboration = async () => {
    if (!currentSchema?.id) return;

    try {
      // Create a mock user for now - in real app, get from auth context
      const currentUser: CollaborationUser = {
        id: 'user_' + Date.now(),
        username: 'current_user',
        role: 'editor',
        color: '#3B82F6'
      };

      // Initialize collaboration service
      collaborationService.initialize(currentUser, currentSchema.id);

      // Set up event handlers
      const handleConnected = () => {
        console.log('✅ Collaboration connected');
        setIsConnected(true);
        setCollaborationStatus(prev => ({
          ...prev,
          isConnected: true,
          lastSync: new Date().toISOString()
        }));
      };

      const handleDisconnected = () => {
        console.log('❌ Collaboration disconnected');
        setIsConnected(false);
        setCollaborationStatus(prev => ({
          ...prev,
          isConnected: false
        }));
      };

      const handleUserJoined = (user: CollaborationUser) => {
        console.log('👋 User joined:', user);
        setCollaborators(prev => {
          const existing = prev.find(c => c.userId === user.id);
          if (existing) {
            return prev.map(c => c.userId === user.id ? { ...c, isOnline: true } : c);
          }
          return [...prev, {
            userId: user.id,
            username: user.username,
            role: user.role,
            status: 'online',
            joinedAt: new Date(),
            color: user.color,
            isOnline: true
          }];
        });
        setCollaborationStatus(prev => ({
          ...prev,
          activeUsers: prev.activeUsers + 1
        }));
      };

      const handleUserLeft = (userId: string) => {
        console.log('👋 User left:', userId);
        setCollaborators(prev => prev.map(c => 
          c.userId === userId ? { ...c, isOnline: false, status: 'offline' } : c
        ));
        setCollaborationStatus(prev => ({
          ...prev,
          activeUsers: Math.max(0, prev.activeUsers - 1)
        }));
      };

      const handleCursorUpdate = (cursor: any) => {
        if (!cursor || !cursor.userId) return;
        
        setCursors(prev => {
          const existing = prev.find(c => c.userId === cursor.userId);
          if (existing) {
            return prev.map(c => c.userId === cursor.userId ? { ...c, ...cursor, lastSeen: new Date() } : c);
          }
          return [...prev, { ...cursor, lastSeen: new Date() }];
        });
      };

      const handleSchemaChange = (message: any) => {
        console.log('🔄 Schema change received:', message);
        // Handle schema changes from other users
        if (message.data && message.userId !== 'current_user') {
          // Apply changes to local schema
          handleSchemaChangeEvent(message);
        }
      };

      const handleError = (error: any) => {
        console.error('❌ Collaboration error:', error);
      };

      // Register event handlers
      collaborationService.on('connected', handleConnected);
      collaborationService.on('disconnected', handleDisconnected);
      collaborationService.on('user_joined', handleUserJoined);
      collaborationService.on('user_left', handleUserLeft);
      collaborationService.on('cursor_update', handleCursorUpdate);
      collaborationService.on('schema_change', handleSchemaChange);
      collaborationService.on('error', handleError);

      // Connect to WebSocket
      await collaborationService.connect();

    } catch (error) {
      console.error('❌ Failed to initialize collaboration:', error);
    }
  };

  // Handle cursor movement
  useEffect(() => {
    const handleCursorMove = (event: CustomEvent) => {
      if (!isConnected || !collaborationService.isConnectedState()) return;
      
      const { x, y, selection } = event.detail;
      
      // Broadcast cursor position to other users
      collaborationService.sendCursorUpdate({
        x,
        y,
        tableId: selection?.tableId,
        columnId: selection?.columnId
      });
    };

    // Listen for cursor move events
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
      const response = await api.post('/api/users/validate', { username: inviteUsername });
      
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
      const invitationResponse = await api.post('/api/invitations', {
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
      const response = await api.post('/api/invitations/validate', { joinCode: joinCode.toUpperCase() });
      
      if (!response.data.valid) {
        setJoinError(response.data.error || 'Invalid or expired code.');
        setIsJoining(false);
        return;
      }

      const invitation = response.data.invitation;
      
      // Update invitation status in database
      await api.put(`/api/invitations/${invitation.id}`, { status: 'accepted' });

      // Add member to database
      const memberResponse = await api.post('/api/members', {
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
      setTimeout(() => setCopiedCode(null), 2000);
    } catch (error) {
      console.error('Failed to copy code:', error);
    }
  };

  const removeMember = async (memberId: string) => {
    try {
      await removeWorkspaceMember(memberId);
      console.log('Member removed successfully');
    } catch (error) {
      console.error('Failed to remove member:', error);
    }
  };

  const handleSchemaChangeEvent = (message: any) => {
    console.log('🔄 Handling schema change event:', message);
    
    // Apply changes based on the change type
    switch (message.changeType) {
      case 'table_created':
        if (message.data && message.userId !== 'current_user') {
          addTable(message.data);
        }
        break;
      case 'table_updated':
        if (message.data && message.userId !== 'current_user') {
          updateTable(message.data.id, message.data);
        }
        break;
      case 'table_deleted':
        if (message.data && message.userId !== 'current_user') {
          removeTable(message.data.id);
        }
        break;
      default:
        console.log('Unknown schema change type:', message.changeType);
    }
  };

  const addRealtimeEvent = (type: RealtimeEvent['type'], userId: string, username: string, data: any) => {
    const event: RealtimeEvent = {
      id: crypto.randomUUID(),
      type,
      userId,
      username,
      timestamp: new Date().toISOString(),
      data
    };
    
    setRealtimeEvents(prev => [event, ...prev.slice(0, 9)]); // Keep last 10 events
  };

  const broadcastCursorPosition = (x: number, y: number, selection?: any) => {
    if (!isConnected || !collaborationService.isConnectedState()) return;
    
    collaborationService.sendCursorUpdate({
      x,
      y,
      tableId: selection?.tableId,
      columnId: selection?.columnId
    });
  };

  const broadcastSchemaChange = (changeType: string, data: any) => {
    if (!isConnected || !collaborationService.isConnectedState()) return;
    
    collaborationService.sendSchemaChange({
      type: changeType as any,
      data,
      userId: 'current_user',
      timestamp: new Date()
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online': return 'text-green-600';
      case 'away': return 'text-yellow-600';
      case 'offline': return 'text-gray-600';
      default: return 'text-gray-600';
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'owner': return <Crown className="w-4 h-4" />;
      case 'admin': return <Shield className="w-4 h-4" />;
      case 'editor': return <Edit className="w-4 h-4" />;
      case 'viewer': return <Eye className="w-4 h-4" />;
      default: return <Users className="w-4 h-4" />;
    }
  };

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'table_created': return <Activity className="w-4 h-4" />;
      case 'table_updated': return <Edit className="w-4 h-4" />;
      case 'table_deleted': return <X className="w-4 h-4" />;
      case 'user_joined': return <UserPlus className="w-4 h-4" />;
      case 'user_left': return <Users className="w-4 h-4" />;
      default: return <Activity className="w-4 h-4" />;
    }
  };

  const formatEventMessage = (event: RealtimeEvent) => {
    switch (event.type) {
      case 'table_created':
        return `${event.username} created a new table`;
      case 'table_updated':
        return `${event.username} updated a table`;
      case 'table_deleted':
        return `${event.username} deleted a table`;
      case 'user_joined':
        return `${event.username} joined the workspace`;
      case 'user_left':
        return `${event.username} left the workspace`;
      default:
        return `${event.username} performed an action`;
    }
  };

  return (
    <div className="space-y-6">
      {/* Connection Status */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/10 dark:to-indigo-900/10 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
            <div>
              <p className="font-medium text-gray-900 dark:text-white">
                {isConnected ? 'Connected' : 'Disconnected'}
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {collaborationStatus.activeUsers} active users
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Wifi className={`w-4 h-4 ${isConnected ? 'text-green-600' : 'text-red-600'}`} />
            <span className={`text-sm font-medium ${isConnected ? 'text-green-600' : 'text-red-600'}`}>
              {isConnected ? 'Real-time' : 'Offline'}
            </span>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex space-x-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
        <button
          onClick={() => setActiveTab('invite')}
          className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
            activeTab === 'invite'
              ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
          }`}
        >
          Invite Users
        </button>
        <button
          onClick={() => setActiveTab('accept')}
          className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
            activeTab === 'accept'
              ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
          }`}
        >
          Join Workspace
        </button>
        <button
          onClick={() => setActiveTab('members')}
          className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
            activeTab === 'members'
              ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
          }`}
        >
          Team Members
        </button>
      </div>

      {/* Tab Content */}
      <div className="space-y-6">
        {/* Invite Users Tab */}
        {activeTab === 'invite' && (
          <div className="space-y-6">
            <div className="bg-gradient-to-br from-white to-blue-50 dark:from-gray-800 dark:to-blue-900/10 border border-gray-200 dark:border-gray-700 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900/20 rounded-lg flex items-center justify-center">
                  <UserPlus className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                </div>
                <h4 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Invite Team Members
                </h4>
              </div>
              
              <div className="space-y-5">
                {/* Username Input */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Username
                  </label>
                  <input
                    type="text"
                    value={inviteUsername}
                    onChange={(e) => setInviteUsername(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200"
                    placeholder="Enter username to invite"
                    disabled={isInviting}
                  />
                </div>

                {/* Role Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Role
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => setInviteRole('editor')}
                      className={`p-3 rounded-xl border-2 transition-all duration-200 ${
                        inviteRole === 'editor'
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                          : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-blue-300'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Edit className="w-4 h-4" />
                        <span className="font-medium">Editor</span>
                      </div>
                      <p className="text-xs mt-1 opacity-75">Can edit and modify</p>
                    </button>
                    <button
                      onClick={() => setInviteRole('viewer')}
                      className={`p-3 rounded-xl border-2 transition-all duration-200 ${
                        inviteRole === 'viewer'
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                          : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-blue-300'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Eye className="w-4 h-4" />
                        <span className="font-medium">Viewer</span>
                      </div>
                      <p className="text-xs mt-1 opacity-75">Can view only</p>
                    </button>
                  </div>
                </div>

                {/* Send Invitation Button */}
                <button
                  onClick={handleSendInvitation}
                  disabled={isInviting || !inviteUsername.trim()}
                  className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:from-gray-400 disabled:to-gray-500 text-white rounded-xl transition-all duration-200 font-medium shadow-lg hover:shadow-xl disabled:shadow-none hover:scale-[1.02] disabled:scale-100"
                >
                  {isInviting ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Sending Invitation...
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
                    Team Members ({collaborators.length})
                  </h4>
                </div>
              </div>
              
              <div className="space-y-3">
                {collaborators.map(member => (
                  <div key={member.userId} className="flex items-center justify-between p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl hover:shadow-md transition-all duration-200">
                    <div className="flex items-center gap-4">
                      <div 
                        className="w-12 h-12 rounded-full flex items-center justify-center"
                        style={{ backgroundColor: member.color + '20' }}
                      >
                        <span className="text-lg font-bold" style={{ color: member.color }}>
                          {member.username.charAt(0).toUpperCase()}
                        </span>
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
                          <div className={`w-2 h-2 rounded-full ${member.isOnline ? 'bg-green-500' : 'bg-gray-400'}`} />
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
                          onClick={() => removeMember(member.userId)}
                          className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors duration-200"
                          title="Remove member"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                
                {collaborators.length === 0 && (
                  <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                    <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>No team members yet</p>
                    <p className="text-sm">Invite users to start collaborating</p>
                  </div>
                )}
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
    </div>
  );
};

export default RealTimeCollaboration;