import React, { useEffect, useState } from 'react';
import { MousePointer } from 'lucide-react';

export interface CursorData {
  userId: string;
  username: string;
  position: { x: number; y: number };
  color: string;
  selection?: {
    tableId: string;
    columnId?: string;
  };
  lastSeen: string;
}

interface CollaborativeCursorsProps {
  cursors: CursorData[];
  onCursorMove?: (position: { x: number; y: number }) => void;
}

const CollaborativeCursors: React.FC<CollaborativeCursorsProps> = ({ 
  cursors, 
  onCursorMove 
}) => {
  const [visibleCursors, setVisibleCursors] = useState<CursorData[]>([]);
  const [lastCursorUpdate, setLastCursorUpdate] = useState<number>(0);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      // Throttle cursor updates to prevent spam
      const now = Date.now();
      if (now - lastCursorUpdate > 100) { // Max 10 updates per second
        const newPosition = { x: e.clientX, y: e.clientY };
        onCursorMove?.(newPosition);
        setLastCursorUpdate(now);
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    return () => document.removeEventListener('mousemove', handleMouseMove);
  }, [onCursorMove, lastCursorUpdate]);

  // Enhanced cursor filtering and deduplication
  useEffect(() => {
    const now = Date.now();
    const threeSecondsAgo = now - 3000; // Reduced timeout for better responsiveness
    
    // Advanced deduplication and filtering
    const cursorMap = new Map<string, CursorData>();
    
    cursors.forEach(cursor => {
      // Skip invalid cursors
      if (!cursor.userId || !cursor.username || cursor.userId === 'current_user') {
        return;
      }
      
      const lastSeenTime = new Date(cursor.lastSeen).getTime();
      
      // Only show recent cursors
      if (lastSeenTime > threeSecondsAgo) {
        const existing = cursorMap.get(cursor.userId);
        
        // Keep the most recent cursor for each user
        if (!existing || lastSeenTime > new Date(existing.lastSeen).getTime()) {
          cursorMap.set(cursor.userId, {
            ...cursor,
            // Ensure position is valid
            position: {
              x: Math.max(0, Math.min(cursor.position.x, window.innerWidth)),
              y: Math.max(0, Math.min(cursor.position.y, window.innerHeight))
            }
          });
        }
      }
    });
    
    setVisibleCursors(Array.from(cursorMap.values()));
  }, [cursors]);

  return (
    <div className="fixed inset-0 pointer-events-none z-50">
      {visibleCursors.map(cursor => (
        <div
          key={cursor.userId}
          className="absolute transition-all duration-150 ease-out pointer-events-none"
          style={{
            left: cursor.position.x,
            top: cursor.position.y,
            transform: 'translate(-2px, -2px)'
          }}
        >
          {/* Cursor Icon */}
          <div className="relative">
            <MousePointer 
              className="w-5 h-5 drop-shadow-lg"
              style={{ color: cursor.color }}
            />
            
            {/* Username Label - Always visible */}
            <div 
              className="absolute top-6 left-2 px-2 py-1 rounded-md text-xs font-medium text-white shadow-lg whitespace-nowrap backdrop-blur-sm border border-white/10"
              style={{ backgroundColor: cursor.color }}
            >
              {cursor.username}
            </div>

            {/* Subtle pulse animation */}
            <div 
              className="absolute w-3 h-3 rounded-full animate-ping opacity-20"
              style={{ 
                backgroundColor: cursor.color,
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)'
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
};

export default CollaborativeCursors;
export type { CursorData };