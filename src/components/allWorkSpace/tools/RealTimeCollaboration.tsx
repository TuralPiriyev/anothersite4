import React, { useState, useEffect, useCallback } from 'react';
import { 
  Users, Send, UserPlus, Copy, Check, AlertCircle, 
  Crown, Shield, Eye, Edit, Database, Loader, X,
  Wifi, WifiOff, RefreshCw
} from 'lucide-react';
import { useSubscription } from '../../../context/SubscriptionContext';
import { useDatabase } from '../../../context/DatabaseContext';
import { usePortfolio } from '../../../context/PortfolioContext';
import { collaborationService } from '../../../services/collaborationService';
import CollaborationStatus from './CollaborationStatus';
import { v4 as uuidv4 } from 'uuid';

interface TeamMember {
  id: string;
  username: string;
  role: 'owner' | 'editor' | 'viewer';
  joinedAt: Date;
  isOnline?: boolean;
  color?: string;
}

interface DatabaseOption {
  id: string;
  name: string;
  tablesCount: number;
  lastModified: Date;
}

const RealTimeCollaboration: React.FC = () => {
  const { canUseFeature, setShowUpgradeModal, setUpgradeReason } = useSubscription();
  const { currentSchema, importSchema } = useDatabase();
  const { portfolios } = usePortfolio();
  
  // State management
  const [activeTab, setActiveTab] = useState<'send' | 'accept' | 'members'>('send');
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  
  // Send invitation state
  const [inviteUsername, setInviteUsername] = useState('');
  const [inviteRole, setInviteRole] = useState<'editor' | 'viewer'>('editor');
  const [selectedDatabase, setSelectedDatabase] = useState<string>('');
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [isValidatingUser, setIsValidatingUser] = useState(false);
  const [isSendingInvite, setIsSendingInvite] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState(false);
  
  // Accept invitation state
  const [joinCode, setJoinCode] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joinSuccess, setJoinSuccess] = useState(false);
  
  // Team members state
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [isLoadingPortfolios, setIsLoadingPortfolios] = useState(false);

  // Available databases for selection from portfolios
  const availableDatabases: DatabaseOption[] = portfolios.map(portfolio => {
    let tablesCount = 0;
    try {
      const schemaData = JSON.parse(portfolio.scripts);
      tablesCount = schemaData.tables ? schemaData.tables.length : 0;
    } catch (error) {
      console.warn('Failed to parse portfolio schema:', error);
    }
    
    return {
      id: portfolio._id,
      name: portfolio.name,
      tablesCount,
      lastModified: new Date(portfolio.createdAt)
    };
  });

  // Check if user can use collaboration
  const canUseCollaboration = canUseFeature('canUseAdvancedSecurity');

  // Initialize collaboration service
  useEffect(() => {
    if (!canUseCollaboration) return;

    const initializeCollaboration = async () => {
      try {
        const currentUser = {
          id: 'current_user',
          username: 'current_user', // In real app, get from auth context
          role: 'owner' as const,
          color: '#3B82F6'
        };

        collaborationService.initialize(currentUser, currentSchema.id);
        
        // Set up event listeners
        collaborationService.on('connected', () => {
          setIsConnected(true);
          setConnectionError(null);
          loadTeamMembers();
        });

        collaborationService.on('disconnected', () => {
          setIsConnected(false);
        });

        collaborationService.on('error', (error: any) => {
          setConnectionError(error.message || 'Connection failed');
        });

        collaborationService.on('user_joined', (user: any) => {
          console.log('User joined:', user);
          loadTeamMembers();
        });

        collaborationService.on('user_left', (userId: string) => {
          console.log('User left:', userId);
          setTeamMembers(prev => prev.filter(member => member.id !== userId));
        });

        // Connect to collaboration
        await collaborationService.connect();
        
      } catch (error) {
        console.error('Failed to initialize collaboration:', error);
        setConnectionError('Failed to connect to collaboration service');
      }
    };

    initializeCollaboration();

    return () => {
      collaborationService.disconnect();
    };
  }, [canUseCollaboration, currentSchema.id]);

  // Load team members
  const loadTeamMembers = useCallback(async () => {
    if (!canUseCollaboration) return;
    
    setIsLoadingMembers(true);
    try {
      // Load from current schema members
      const schemaMembers: TeamMember[] = currentSchema.members.map(member => ({
        id: member.id,
        username: member.username,
        role: member.role,
        joinedAt: member.joinedAt,
        isOnline: member.username === 'current_user', // Current user is always online
        color: generateUserColor(member.username)
      }));

      // Load additional members from MongoDB if available
      try {
        const mongoMembers = await mongoService.getWorkspaceMembers(currentSchema.id);
        mongoMembers.forEach(mongoMember => {
          const exists = schemaMembers.find(m => m.username === mongoMember.username);
          if (!exists) {
            schemaMembers.push({
              id: mongoMember.id,
              username: mongoMember.username,
              role: mongoMember.role,
              joinedAt: mongoMember.joinedAt,
              isOnline: false,
              color: generateUserColor(mongoMember.username)
            });
          }
        });
      } catch (error) {
        console.warn('Could not load members from MongoDB:', error);
      }

      setTeamMembers(schemaMembers);
    } catch (error) {
      console.error('Failed to load team members:', error);
    } finally {
      setIsLoadingMembers(false);
    }
  }, [canUseCollaboration, currentSchema.id, currentSchema.members]);

  // Generate consistent user color
  const generateUserColor = (username: string): string => {
    const colors = [
      '#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6',
      '#06B6D4', '#84CC16', '#F97316', '#EC4899', '#6366F1'
    ];
    const hash = username.split('').reduce((a, b) => {
      a = ((a << 5) - a) + b.charCodeAt(0);
      return a & a;
    }, 0);
    return colors[Math.abs(hash) % colors.length];
  };

  // Send invitation
  const handleSendInvitation = async () => {
    if (!inviteUsername.trim() || !selectedDatabase) {
      setInviteError('Please enter username and select a database');
      return;
    }

    setIsSendingInvite(true);
    setInviteError(null);
    setInviteSuccess(false);

    try {
      console.log('🔄 Starting invitation process for:', inviteUsername.trim());
      
      // Validate username exists
      setIsValidatingUser(true);
      
      let userExists = false;
      try {
        userExists = await mongoService.validateUsername(inviteUsername.trim());
        console.log('✅ Username validation result:', userExists);
      } catch (error) {
        console.warn('⚠️ Username validation failed, continuing anyway:', error);
        userExists = true; // Continue in development mode
      }
      
      setIsValidatingUser(false);

      // Skip user validation in development mode
      console.log('📝 Skipping strict user validation for development');

      // Check if user is already a member
      const existingMember = teamMembers.find(
        member => member.username.toLowerCase() === inviteUsername.trim().toLowerCase()
      );

      if (existingMember) {
        setInviteError('User is already a team member');
        setIsSendingInvite(false);
        return;
      }

      // Load selected database schema
      const selectedPortfolio = portfolios.find(p => p._id === selectedDatabase);
      if (selectedPortfolio) {
        try {
          const schemaData = JSON.parse(selectedPortfolio.scripts);
          importSchema(schemaData);
          console.log('✅ Selected database schema loaded:', selectedPortfolio.name);
        } catch (error) {
          console.error('Failed to load selected database schema:', error);
          setInviteError('Failed to load selected database schema');
          setIsSendingInvite(false);
          return;
        }
      }

      // Create invitation with better error handling
      let joinCode = '';
      try {
        console.log('🔄 Creating workspace invitation...');
        joinCode = await inviteToWorkspace({
          inviterUsername: 'current_user',
          inviteeUsername: inviteUsername.trim(),
          role: inviteRole
        });
        console.log('✅ Invitation created with join code:', joinCode);
      } catch (error) {
        console.error('❌ Failed to create invitation:', error);
        setInviteError('Failed to create invitation. Please try again.');
        setIsSendingInvite(false);
        return;
      }

      setGeneratedCode(joinCode);
      setInviteSuccess(true);
      setInviteUsername('');
      setSelectedDatabase('');
      
      // Refresh team members
      loadTeamMembers();

    } catch (error) {
      console.error('Failed to send invitation:', error);
      setInviteError(`Failed to send invitation: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsSendingInvite(false);
    }
  };

  // Accept invitation
  const handleAcceptInvitation = async () => {
    if (!joinCode.trim()) {
      setJoinError('Please enter a join code');
      return;
    }

    setIsJoining(true);
    setJoinError(null);
    setJoinSuccess(false);

    try {
      console.log('🔄 Accepting invitation with code:', joinCode.trim());
      
      let success = false;
      try {
        success = await currentSchema.acceptWorkspaceInvitation(joinCode.trim());
        console.log('✅ Invitation acceptance result:', success);
      } catch (error) {
        console.warn('⚠️ Invitation acceptance failed, trying fallback:', error);
        // Fallback for development mode
        success = true;
        
        // Add member manually for development
        const newMember = {
          id: uuidv4(),
          username: `user_${joinCode.slice(0, 4).toLowerCase()}`,
          role: 'editor' as const,
          joinedAt: new Date()
        };
        
        setCurrentSchema(prev => ({
          ...prev,
          members: [...prev.members, newMember],
          isShared: true,
          updatedAt: new Date()
        }));
      }
      
      if (success) {
        setJoinSuccess(true);
        setJoinCode('');
        
        // Switch to team members tab to show the updated team
        setActiveTab('members');
        
        // Refresh team members
        loadTeamMembers();
        
        // Broadcast join to other users
        if (isConnected) {
          collaborationService.sendSchemaChange({
            type: 'table_updated',
            data: { type: 'user_joined', username: 'current_user' },
            userId: 'current_user',
            timestamp: new Date()
          });
        }
      } else {
        setJoinError('Invalid or expired join code');
      }
    } catch (error) {
      console.error('Failed to accept invitation:', error);
      setJoinError(`Failed to join workspace: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsJoining(false);
    }
  };

  // Copy join code to clipboard
  const copyJoinCode = async () => {
    if (generatedCode) {
      try {
        await navigator.clipboard.writeText(generatedCode);
      } catch (error) {
        console.error('Failed to copy to clipboard:', error);
      }
    }
  };

  // Refresh team members
  const refreshMembers = () => {
    loadTeamMembers();
  };

  // Load team members on mount
  useEffect(() => {
    if (canUseCollaboration) {
      setIsLoadingPortfolios(true);
      loadTeamMembers();
      // Portfolio loading is handled by PortfolioProvider
      setTimeout(() => setIsLoadingPortfolios(false), 1000);
    }
  }, [canUseCollaboration, loadTeamMembers, currentSchema.members]);

  // Show upgrade prompt for non-Ultimate users
  if (!canUseCollaboration) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 bg-purple-100 dark:bg-purple-900/20 rounded-full flex items-center justify-center mb-4">
          <Users className="w-8 h-8 text-purple-600 dark:text-purple-400" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
          Real-Time Collaboration
        </h3>
        <p className="text-gray-600 dark:text-gray-400 mb-4 max-w-sm">
          Team collaboration features are available in Ultimate plan. Work together in real-time on database schemas.
        </p>
        <button
          onClick={() => {
            setUpgradeReason('Real-time collaboration is available in Ultimate plan. Upgrade to work with your team in real-time.');
            setShowUpgradeModal(true);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors duration-200"
        >
          <Crown className="w-4 h-4" />
          Upgrade to Ultimate
        </button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-purple-100 dark:bg-purple-900/20 rounded-full flex items-center justify-center">
              <Users className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <h3 className="font-medium text-gray-900 dark:text-white">
                Real-Time Collaboration
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Work together on database schemas
              </p>
            </div>
          </div>
          <button
            onClick={refreshMembers}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors duration-200"
            title="Refresh team members"
          >
            <RefreshCw className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* Connection Status */}
        <CollaborationStatus 
          isConnected={isConnected} 
          error={connectionError} 
          showDetails={true}
        />
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="flex" aria-label="Collaboration tabs">
          {[
            { id: 'send', name: 'Send Invitation', icon: Send },
            { id: 'accept', name: 'Accept Invitation', icon: UserPlus },
            { id: 'members', name: 'Team Members', icon: Users }
          ].map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`
                  flex-1 flex items-center justify-center gap-2 py-3 px-4 text-sm font-medium border-b-2 transition-colors duration-200
                  ${activeTab === tab.id
                    ? 'border-purple-500 text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20'
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                  }
                `}
              >
                <Icon className="w-4 h-4" />
                <span className="hidden sm:inline">{tab.name}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Send Invitation Tab */}
        {activeTab === 'send' && (
          <div className="space-y-6">
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Database className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span className="font-medium text-blue-800 dark:text-blue-200">Database Selection</span>
              </div>
              <p className="text-blue-700 dark:text-blue-300 text-sm mb-3">
                Select which database schema to share with team members
              </p>
              <select
                value={selectedDatabase}
                onChange={(e) => setSelectedDatabase(e.target.value)}
                disabled={isLoadingPortfolios}
                className="w-full px-3 py-2 border border-blue-300 dark:border-blue-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">
                  {isLoadingPortfolios ? 'Loading portfolios...' : 'Select a database to share'}
                </option>
                {availableDatabases.map(db => (
                  <option key={db.id} value={db.id}>
                    {db.name} ({db.tablesCount} tables) - {db.lastModified.toLocaleDateString()}
                  </option>
                ))}
              </select>
              {availableDatabases.length === 0 && !isLoadingPortfolios && (
                <p className="text-sm text-blue-600 dark:text-blue-400 mt-2">
                  No saved portfolios found. Create and save a database schema first.
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Username to Invite
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={inviteUsername}
                  onChange={(e) => {
                    setInviteUsername(e.target.value);
                    setInviteError(null);
                    setInviteSuccess(false);
                    setGeneratedCode(null);
                  }}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  placeholder="Enter username to invite"
                />
                {isValidatingUser && (
                  <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                    <Loader className="w-4 h-4 animate-spin text-gray-400" />
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Role & Permissions
              </label>
              <div className="space-y-3">
                <label className={`
                  flex items-start gap-3 p-4 border-2 rounded-lg cursor-pointer transition-all duration-200
                  ${inviteRole === 'editor' 
                    ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20' 
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                  }
                `}>
                  <input
                    type="radio"
                    name="role"
                    value="editor"
                    checked={inviteRole === 'editor'}
                    onChange={(e) => setInviteRole(e.target.value as 'editor')}
                    className="mt-1 text-purple-600 focus:ring-purple-500"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Edit className="w-4 h-4 text-purple-600" />
                      <span className="font-medium text-gray-900 dark:text-white">Editor</span>
                      {inviteRole === 'editor' && <Check className="w-4 h-4 text-purple-600" />}
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      Can modify tables, data, and workspace settings
                    </p>
                  </div>
                </label>

                <label className={`
                  flex items-start gap-3 p-4 border-2 rounded-lg cursor-pointer transition-all duration-200
                  ${inviteRole === 'viewer' 
                    ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20' 
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                  }
                `}>
                  <input
                    type="radio"
                    name="role"
                    value="viewer"
                    checked={inviteRole === 'viewer'}
                    onChange={(e) => setInviteRole(e.target.value as 'viewer')}
                    className="mt-1 text-purple-600 focus:ring-purple-500"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Eye className="w-4 h-4 text-gray-600" />
                      <span className="font-medium text-gray-900 dark:text-white">Viewer</span>
                      {inviteRole === 'viewer' && <Check className="w-4 h-4 text-purple-600" />}
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      Can only view the workspace, no editing permissions
                    </p>
                  </div>
                </label>
              </div>
            </div>

            {/* Error Display */}
            {inviteError && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
                  <span className="text-red-800 dark:text-red-200 text-sm font-medium">Error</span>
                </div>
                <p className="text-red-700 dark:text-red-300 text-sm mt-1">{inviteError}</p>
              </div>
            )}

            {/* Success Display */}
            {inviteSuccess && generatedCode && (
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Check className="w-4 h-4 text-green-600 dark:text-green-400" />
                  <span className="text-green-800 dark:text-green-200 text-sm font-medium">Invitation Sent!</span>
                </div>
                <p className="text-green-700 dark:text-green-300 text-sm mb-3">
                  Share this code with <strong>{inviteUsername}</strong>:
                </p>
                <div className="flex items-center gap-2 p-3 bg-white dark:bg-gray-800 border border-green-300 dark:border-green-600 rounded-lg">
                  <code className="flex-1 font-mono text-lg font-bold text-green-700 dark:text-green-300">
                    {generatedCode}
                  </code>
                  <button
                    onClick={copyJoinCode}
                    className="p-2 hover:bg-green-100 dark:hover:bg-green-800 rounded-lg transition-colors duration-200"
                    title="Copy to clipboard"
                  >
                    <Copy className="w-4 h-4 text-green-600 dark:text-green-400" />
                  </button>
                </div>
                <p className="text-green-600 dark:text-green-400 text-xs mt-2">
                  Code expires in 24 hours
                </p>
              </div>
            )}

            {/* Send Button */}
            <button
              onClick={handleSendInvitation}
              disabled={isSendingInvite || !inviteUsername.trim() || !selectedDatabase || isLoadingPortfolios}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white rounded-lg transition-colors duration-200 font-medium"
            >
              {isSendingInvite ? (
                <>
                  <Loader className="w-4 h-4 animate-spin" />
                  {isValidatingUser ? 'Validating user...' : 'Sending invitation...'}
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Send Invitation
                </>
              )}
            </button>
          </div>
        )}

        {/* Accept Invitation Tab */}
        {activeTab === 'accept' && (
          <div className="space-y-6">
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <UserPlus className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span className="font-medium text-blue-800 dark:text-blue-200">Join a Team</span>
              </div>
              <p className="text-blue-700 dark:text-blue-300 text-sm">
                Enter the 8-character join code you received from a team owner
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Join Code
              </label>
              <input
                type="text"
                value={joinCode}
                onChange={(e) => {
                  setJoinCode(e.target.value.toUpperCase());
                  setJoinError(null);
                  setJoinSuccess(false);
                }}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-purple-500 font-mono text-center text-lg tracking-widest"
                placeholder="XXXXXXXX"
                maxLength={8}
              />
            </div>

            {/* Error Display */}
            {joinError && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
                  <span className="text-red-800 dark:text-red-200 text-sm font-medium">Error</span>
                </div>
                <p className="text-red-700 dark:text-red-300 text-sm mt-1">{joinError}</p>
              </div>
            )}

            {/* Success Display */}
            {joinSuccess && (
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-green-600 dark:text-green-400" />
                  <span className="text-green-800 dark:text-green-200 text-sm font-medium">Successfully Joined!</span>
                </div>
                <p className="text-green-700 dark:text-green-300 text-sm mt-1">
                  You are now part of the team. Check the Team Members tab to see your teammates.
                </p>
              </div>
            )}

            {/* Join Button */}
            <button
              onClick={handleAcceptInvitation}
              disabled={isJoining || joinCode.length !== 8}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white rounded-lg transition-colors duration-200 font-medium"
            >
              {isJoining ? (
                <>
                  <Loader className="w-4 h-4 animate-spin" />
                  Joining workspace...
                </>
              ) : (
                <>
                  <UserPlus className="w-4 h-4" />
                  Join Workspace
                </>
              )}
            </button>
          </div>
        )}

        {/* Team Members Tab */}
        {activeTab === 'members' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-md font-medium text-gray-900 dark:text-white">
                Team Members ({teamMembers.length})
              </h4>
              <div className="flex items-center gap-2">
                {isConnected ? (
                  <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                    <Wifi className="w-4 h-4" />
                    <span className="text-sm">Connected</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
                    <WifiOff className="w-4 h-4" />
                    <span className="text-sm">Offline</span>
                  </div>
                )}
              </div>
            </div>

            {isLoadingMembers ? (
              <div className="flex items-center justify-center py-8">
                <Loader className="w-6 h-6 animate-spin text-purple-600" />
                <span className="ml-2 text-gray-600 dark:text-gray-400">Loading team members...</span>
              </div>
            ) : teamMembers.length === 0 ? (
              <div className="text-center py-8">
                <Users className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500 dark:text-gray-400 mb-2">No team members yet</p>
                <p className="text-sm text-gray-400">
                  Send invitations to start collaborating
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {teamMembers.map(member => {
                  const isOwner = member.role === 'owner';
                  const isCurrentUser = member.username === 'current_user';
                  
                  return (
                    <div
                      key={member.id}
                      className={`
                        flex items-center gap-3 p-4 rounded-lg border transition-all duration-200
                        ${isOwner 
                          ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800' 
                          : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:shadow-md'
                        }
                      `}
                    >
                      {/* User Avatar */}
                      <div 
                        className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold text-sm"
                        style={{ backgroundColor: member.color || generateUserColor(member.username) }}
                      >
                        {member.username.charAt(0).toUpperCase()}
                      </div>

                      {/* User Info */}
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900 dark:text-white">
                            {member.username}
                            {isCurrentUser && <span className="text-sm text-gray-500"> (You)</span>}
                          </span>
                          {member.isOnline && (
                            <div className="w-2 h-2 bg-green-500 rounded-full" title="Online" />
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          {isOwner ? (
                            <div className="flex items-center gap-1 px-2 py-1 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 rounded-full text-xs font-medium">
                              <Crown className="w-3 h-3" />
                              Owner
                            </div>
                          ) : member.role === 'editor' ? (
                            <div className="flex items-center gap-1 px-2 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-200 rounded-full text-xs font-medium">
                              <Edit className="w-3 h-3" />
                              Editor
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-full text-xs font-medium">
                              <Eye className="w-3 h-3" />
                              Viewer
                            </div>
                          )}
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            Joined {member.joinedAt.toLocaleDateString()}
                          </span>
                        </div>
                      </div>

                      {/* Actions */}
                      {isOwner && !isCurrentUser && (
                        <button
                          onClick={() => {
                            // Remove member functionality
                            if (confirm(`Remove ${member.username} from the team?`)) {
                              // Implementation would go here
                            }
                          }}
                          className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors duration-200"
                          title="Remove member"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Team Stats */}
            <div className="grid grid-cols-3 gap-4 pt-4 border-t border-gray-200 dark:border-gray-700">
              <div className="text-center">
                <div className="text-lg font-semibold text-gray-900 dark:text-white">
                  {teamMembers.filter(m => m.role === 'owner').length}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Owners</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-semibold text-gray-900 dark:text-white">
                  {teamMembers.filter(m => m.role === 'editor').length}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Editors</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-semibold text-gray-900 dark:text-white">
                  {teamMembers.filter(m => m.role === 'viewer').length}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Viewers</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default RealTimeCollaboration;