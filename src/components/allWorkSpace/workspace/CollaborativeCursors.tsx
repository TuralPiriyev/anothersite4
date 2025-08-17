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
  const [localCursor, setLocalCursor] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [visibleCursors, setVisibleCursors] = useState<CursorData[]>([]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const newPosition = { x: e.clientX, y: e.clientY };
      setLocalCursor(newPosition);
      onCursorMove?.(newPosition);
    };

    document.addEventListener('mousemove', handleMouseMove);
    return () => document.removeEventListener('mousemove', handleMouseMove);
  }, [onCursorMove]);

  // Filter and deduplicate cursors
  useEffect(() => {
    const now = Date.now();
    const fiveSecondsAgo = now - 5000;
    
    // Remove old cursors and deduplicate by userId
    const uniqueCursors = cursors.reduce((acc, cursor) => {
      const lastSeenTime = new Date(cursor.lastSeen).getTime();
      
      // Only show cursors from last 5 seconds
      if (lastSeenTime > fiveSecondsAgo) {
        // Check if we already have a cursor for this user
        const existingIndex = acc.findIndex(c => c.userId === cursor.userId);
        if (existingIndex >= 0) {
          // Keep the most recent one
          if (lastSeenTime > new Date(acc[existingIndex].lastSeen).getTime()) {
            acc[existingIndex] = cursor;
          }
        } else {
          acc.push(cursor);
        }
      }
      
      return acc;
    }, [] as CursorData[]);
    
    setVisibleCursors(uniqueCursors);
  }, [cursors]);

  return (
    <div className="fixed inset-0 pointer-events-none z-50">
      {visibleCursors.map(cursor => (
        <div
          key={cursor.userId}
          className="absolute transition-all duration-200 ease-out pointer-events-none"
          style={{
            left: cursor.position.x,
            top: cursor.position.y,
            transform: 'translate(-2px, -2px)'
          }}
        >
          {/* Cursor Icon */}
          <div className="relative">
            <MousePointer 
              className="w-6 h-6 drop-shadow-lg filter drop-shadow-md"
              style={{ color: cursor.color }}
            />
            
            {/* Enhanced Username Label */}
            <div 
              className="absolute top-7 left-3 px-3 py-1.5 rounded-lg text-xs font-semibold text-white shadow-xl whitespace-nowrap border border-white/20 backdrop-blur-sm"
              style={{ backgroundColor: cursor.color }}
            >
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 bg-white rounded-full opacity-80"></div>
                <span>{cursor.username}</span>
              </div>
              {cursor.selection && (
                <div className="text-xs opacity-90 mt-0.5">
                  editing table
                </div>
              )}
            </div>

            {/* Pulse Animation */}
            <div 
              className="absolute w-4 h-4 rounded-full animate-ping opacity-30"
              style={{ 
                backgroundColor: cursor.color,
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)'
              }}
            />
          </div>

          {/* Selection Highlight */}
          {cursor.selection && (
            <div 
              className="absolute w-2 h-2 rounded-full animate-pulse"
              style={{ 
                backgroundColor: cursor.color,
                top: -4,
                left: -4
              }}
            />
          )}
        </div>
      ))}
    </div>
  );
};

export default CollaborativeCursors;
export type { CursorData };