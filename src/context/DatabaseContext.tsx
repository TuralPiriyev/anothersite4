import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { collaborationService } from '../services/collaborationService';
import { mongoService } from '../services/mongoService';

interface Table {
  id: string;
  name: string;
  columns: Column[];
  position: { x: number; y: number };
}

interface Column {
  id: string;
  name: string;
  type: string;
  isPrimary: boolean;
  isNullable: boolean;
  defaultValue?: string;
}

interface Relationship {
  id: string;
  sourceTable: string;
  sourceColumn: string;
  targetTable: string;
  targetColumn: string;
  type: 'one-to-one' | 'one-to-many' | 'many-to-many';
}

interface Schema {
  id: string;
  name: string;
  tables: Table[];
  relationships: Relationship[];
  createdAt: Date;
  updatedAt: Date;
}

interface DatabaseContextType {
  currentSchema: Schema | null;
  schemas: Schema[];
  isLoading: boolean;
  error: string | null;
  
  // Schema management
  createSchema: (name: string) => Promise<void>;
  loadSchema: (id: string) => Promise<void>;
  updateSchema: (id: string, updates: Partial<Schema>) => Promise<void>;
  deleteSchema: (id: string) => Promise<void>;
  
  // Table management with real-time collaboration
  addTable: (table: Omit<Table, 'id'>) => void;
  updateTable: (id: string, updates: Partial<Table>) => void;
  removeTable: (id: string) => void;
  
  // Column management
  addColumn: (tableId: string, column: Omit<Column, 'id'>) => void;
  updateColumn: (tableId: string, columnId: string, updates: Partial<Column>) => void;
  removeColumn: (tableId: string, columnId: string) => void;
  
  // Relationship management
  addRelationship: (relationship: Omit<Relationship, 'id'>) => void;
  updateRelationship: (id: string, updates: Partial<Relationship>) => void;
  removeRelationship: (id: string) => void;
  
  // Collaboration functions
  inviteToWorkspace: (username: string, role: 'editor' | 'viewer') => Promise<void>;
  acceptWorkspaceInvitation: (code: string) => Promise<void>;
  removeWorkspaceMember: (memberId: string) => Promise<void>;
  syncWorkspaceWithMongoDB: () => Promise<void>;
}

const DatabaseContext = createContext<DatabaseContextType | undefined>(undefined);

export const useDatabase = () => {
  const context = useContext(DatabaseContext);
  if (!context) {
    throw new Error('useDatabase must be used within a DatabaseProvider');
  }
  return context;
};

interface DatabaseProviderProps {
  children: ReactNode;
}

export const DatabaseProvider: React.FC<DatabaseProviderProps> = ({ children }) => {
  const { user: currentUser, isAuthenticated } = useAuth();
  const [currentSchema, setCurrentSchema] = useState<Schema | null>(null);
  const [schemas, setSchemas] = useState<Schema[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Real-time collaboration integration
  useEffect(() => {
    if (!currentSchema?.id || !currentUser || !isAuthenticated) return;

    const initializeCollaboration = async () => {
      try {
        // Initialize collaboration service with real user data
        const collaborationUser = {
          id: currentUser.id,
          username: currentUser.username,
          role: currentUser.role,
          color: currentUser.color,
          isOnline: true,
          lastSeen: new Date()
        };

        await collaborationService.initialize(collaborationUser, currentSchema.id);

        // Set up event handlers for real-time collaboration
        const handleSchemaChange = (message: any) => {
          console.log('🔄 Schema change received from collaboration:', message);
          
          // Only apply changes from other users
          if (message.data && message.userId !== currentUser.id) {
            handleSchemaChangeEvent(message);
          }
        };

        const handleUserJoined = (user: any) => {
          console.log('👋 User joined workspace:', user);
        };

        const handleUserLeft = (userId: string) => {
          console.log('👋 User left workspace:', userId);
        };

        const handleCursorUpdate = (cursor: any) => {
          console.log('📍 Cursor update received:', cursor);
        };

        // Register event handlers
        collaborationService.on('schema_change', handleSchemaChange);
        collaborationService.on('user_joined', handleUserJoined);
        collaborationService.on('user_left', handleUserLeft);
        collaborationService.on('cursor_update', handleCursorUpdate);

        // Connect to WebSocket
        await collaborationService.connect();

      } catch (error) {
        console.error('❌ Failed to initialize collaboration:', error);
      }
    };

    initializeCollaboration();

    // Cleanup on unmount
    return () => {
      collaborationService.disconnect();
    };
  }, [currentSchema?.id, currentUser, isAuthenticated]);

  // Handle schema changes from other users
  const handleSchemaChangeEvent = (message: any) => {
    console.log('🔄 Applying schema change from other user:', message);
    
    if (!message.data || message.userId === currentUser?.id) return;

    switch (message.changeType) {
      case 'table_created':
        if (message.data) {
          addTableWithCollaboration(message.data);
        }
        break;
      case 'table_updated':
        if (message.data && message.data.id) {
          updateTableWithCollaboration(message.data.id, message.data);
        }
        break;
      case 'table_deleted':
        if (message.data && message.data.id) {
          removeTableWithCollaboration(message.data.id);
        }
        break;
      case 'relationship_added':
        if (message.data) {
          addRelationshipWithCollaboration(message.data);
        }
        break;
      case 'relationship_removed':
        if (message.data && message.data.id) {
          removeRelationshipWithCollaboration(message.data.id);
        }
        break;
      default:
        console.log('Unknown schema change type:', message.changeType);
    }
  };

  // Schema management functions
  const createSchema = async (name: string) => {
    if (!currentUser) {
      setError('You must be logged in to create schemas');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const newSchema: Schema = {
        id: `schema_${Date.now()}`,
        name,
        tables: [],
        relationships: [],
        createdAt: new Date(),
        updatedAt: new Date()
      };

      setSchemas(prev => [...prev, newSchema]);
      setCurrentSchema(newSchema);
    } catch (error) {
      setError('Failed to create schema');
      console.error('Create schema error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadSchema = async (id: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const schema = schemas.find(s => s.id === id);
      if (schema) {
        setCurrentSchema(schema);
      } else {
        setError('Schema not found');
      }
    } catch (error) {
      setError('Failed to load schema');
      console.error('Load schema error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const updateSchema = async (id: string, updates: Partial<Schema>) => {
    try {
      setSchemas(prev => prev.map(s => 
        s.id === id ? { ...s, ...updates, updatedAt: new Date() } : s
      ));
      
      if (currentSchema?.id === id) {
        setCurrentSchema(prev => prev ? { ...prev, ...updates, updatedAt: new Date() } : null);
      }
    } catch (error) {
      setError('Failed to update schema');
      console.error('Update schema error:', error);
    }
  };

  const deleteSchema = async (id: string) => {
    try {
      setSchemas(prev => prev.filter(s => s.id !== id));
      
      if (currentSchema?.id === id) {
        setCurrentSchema(null);
      }
    } catch (error) {
      setError('Failed to delete schema');
      console.error('Delete schema error:', error);
    }
  };

  // Table management with real-time collaboration
  const addTableWithCollaboration = (table: Omit<Table, 'id'>) => {
    const newTable: Table = {
      ...table,
      id: `table_${Date.now()}`
    };

    setCurrentSchema(prev => {
      if (!prev) return null;
      return {
        ...prev,
        tables: [...prev.tables, newTable],
        updatedAt: new Date()
      };
    });

    // Broadcast to other users
    if (currentUser && collaborationService.isConnectedState()) {
      collaborationService.sendSchemaChange({
        type: 'table_created',
        data: newTable,
        userId: currentUser.id,
        timestamp: new Date()
      });
    }
  };

  const updateTableWithCollaboration = (id: string, updates: Partial<Table>) => {
    setCurrentSchema(prev => {
      if (!prev) return null;
      return {
        ...prev,
        tables: prev.tables.map(t => 
          t.id === id ? { ...t, ...updates } : t
        ),
        updatedAt: new Date()
      };
    });

    // Broadcast to other users
    if (currentUser && collaborationService.isConnectedState()) {
      collaborationService.sendSchemaChange({
        type: 'table_updated',
        data: { id, ...updates },
        userId: currentUser.id,
        timestamp: new Date()
      });
    }
  };

  const removeTableWithCollaboration = (id: string) => {
    setCurrentSchema(prev => {
      if (!prev) return null;
      return {
        ...prev,
        tables: prev.tables.filter(t => t.id !== id),
        relationships: prev.relationships.filter(r => 
          r.sourceTable !== id && r.targetTable !== id
        ),
        updatedAt: new Date()
      };
    });

    // Broadcast to other users
    if (currentUser && collaborationService.isConnectedState()) {
      collaborationService.sendSchemaChange({
        type: 'table_deleted',
        data: { id },
        userId: currentUser.id,
        timestamp: new Date()
      });
    }
  };

  // Legacy table management functions (for backward compatibility)
  const addTable = (table: Omit<Table, 'id'>) => {
    addTableWithCollaboration(table);
  };

  const updateTable = (id: string, updates: Partial<Table>) => {
    updateTableWithCollaboration(id, updates);
  };

  const removeTable = (id: string) => {
    removeTableWithCollaboration(id);
  };

  // Column management
  const addColumn = (tableId: string, column: Omit<Column, 'id'>) => {
    const newColumn: Column = {
      ...column,
      id: `column_${Date.now()}`
    };

    setCurrentSchema(prev => {
      if (!prev) return null;
      return {
        ...prev,
        tables: prev.tables.map(t => 
          t.id === tableId 
            ? { ...t, columns: [...t.columns, newColumn] }
            : t
        ),
        updatedAt: new Date()
      };
    });
  };

  const updateColumn = (tableId: string, columnId: string, updates: Partial<Column>) => {
    setCurrentSchema(prev => {
      if (!prev) return null;
      return {
        ...prev,
        tables: prev.tables.map(t => 
          t.id === tableId 
            ? { 
                ...t, 
                columns: t.columns.map(c => 
                  c.id === columnId ? { ...c, ...updates } : c
                )
              }
            : t
        ),
        updatedAt: new Date()
      };
    });
  };

  const removeColumn = (tableId: string, columnId: string) => {
    setCurrentSchema(prev => {
      if (!prev) return null;
      return {
        ...prev,
        tables: prev.tables.map(t => 
          t.id === tableId 
            ? { 
                ...t, 
                columns: t.columns.filter(c => c.id !== columnId)
              }
            : t
        ),
        updatedAt: new Date()
      };
    });
  };

  // Relationship management with real-time collaboration
  const addRelationshipWithCollaboration = (relationship: Omit<Relationship, 'id'>) => {
    const newRelationship: Relationship = {
      ...relationship,
      id: `relationship_${Date.now()}`
    };

    setCurrentSchema(prev => {
      if (!prev) return null;
      return {
        ...prev,
        relationships: [...prev.relationships, newRelationship],
        updatedAt: new Date()
      };
    });

    // Broadcast to other users
    if (currentUser && collaborationService.isConnectedState()) {
      collaborationService.sendSchemaChange({
        type: 'relationship_added',
        data: newRelationship,
        userId: currentUser.id,
        timestamp: new Date()
      });
    }
  };

  const updateRelationship = (id: string, updates: Partial<Relationship>) => {
    setCurrentSchema(prev => {
      if (!prev) return null;
      return {
        ...prev,
        relationships: prev.relationships.map(r => 
          r.id === id ? { ...r, ...updates } : r
        ),
        updatedAt: new Date()
      };
    });
  };

  const removeRelationshipWithCollaboration = (id: string) => {
    setCurrentSchema(prev => {
      if (!prev) return null;
      return {
        ...prev,
        relationships: prev.relationships.filter(r => r.id !== id),
        updatedAt: new Date()
      };
    });

    // Broadcast to other users
    if (currentUser && collaborationService.isConnectedState()) {
      collaborationService.sendSchemaChange({
        type: 'relationship_removed',
        data: { id },
        userId: currentUser.id,
        timestamp: new Date()
      });
    }
  };

  // Legacy relationship management functions
  const addRelationship = (relationship: Omit<Relationship, 'id'>) => {
    addRelationshipWithCollaboration(relationship);
  };

  const removeRelationship = (id: string) => {
    removeRelationshipWithCollaboration(id);
  };

  // Collaboration functions
  const inviteToWorkspace = async (username: string, role: 'editor' | 'viewer') => {
    if (!currentUser || !currentSchema) {
      throw new Error('You must be logged in and have a current schema');
    }

    try {
      // This would integrate with your invitation system
      console.log('Inviting user to workspace:', { username, role, schemaId: currentSchema.id });
    } catch (error) {
      console.error('Failed to invite user:', error);
      throw error;
    }
  };

  const acceptWorkspaceInvitation = async (code: string) => {
    if (!currentUser) {
      throw new Error('You must be logged in to accept invitations');
    }

    try {
      // This would integrate with your invitation system
      console.log('Accepting workspace invitation:', { code, userId: currentUser.id });
    } catch (error) {
      console.error('Failed to accept invitation:', error);
      throw error;
    }
  };

  const removeWorkspaceMember = async (memberId: string) => {
    if (!currentUser) {
      throw new Error('You must be logged in to remove members');
    }

    try {
      // This would integrate with your member management system
      console.log('Removing workspace member:', { memberId, schemaId: currentSchema?.id });
    } catch (error) {
      console.error('Failed to remove member:', error);
      throw error;
    }
  };

  const syncWorkspaceWithMongoDB = async () => {
    if (!currentSchema || !currentUser) {
      console.warn('Cannot sync: no current schema or user');
      return;
    }

    try {
      // Sync current schema with MongoDB
      await mongoService.syncSchema(currentSchema);
      console.log('✅ Schema synced with MongoDB');
    } catch (error) {
      console.error('❌ Failed to sync schema with MongoDB:', error);
      setError('Failed to sync with database');
    }
  };

  const value: DatabaseContextType = {
    currentSchema,
    schemas,
    isLoading,
    error,
    createSchema,
    loadSchema,
    updateSchema,
    deleteSchema,
    addTable,
    updateTable,
    removeTable,
    addColumn,
    updateColumn,
    removeColumn,
    addRelationship,
    updateRelationship,
    removeRelationship,
    inviteToWorkspace,
    acceptWorkspaceInvitation,
    removeWorkspaceMember,
    syncWorkspaceWithMongoDB
  };

  return (
    <DatabaseContext.Provider value={value}>
      {children}
    </DatabaseContext.Provider>
  );
};
