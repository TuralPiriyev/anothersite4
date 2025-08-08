import React, { useEffect, useState } from 'react';

export default function CursorOverlay() {
  const [cursors, setCursors] = useState([]);

  useEffect(() => {
    function onCursor(e) {
      const { userId, username, x, y } = e.detail;
      setCursors(prev => {
        const idx = prev.findIndex(c => c.userId === userId);
        const next = { userId, username, x, y };
        if (idx >= 0) {
          const copy = [...prev];
          copy[idx] = next;
          return copy;
        }
        return [...prev, next];
      });
    }
    window.addEventListener('team-cursor', onCursor);
    return () => window.removeEventListener('team-cursor', onCursor);
  }, []);

  return (
    <div style={{ pointerEvents: 'none', position: 'absolute', inset: 0, zIndex: 50 }}>
      {cursors.map(c => (
        <div key={c.userId} style={{ position: 'absolute', left: c.x, top: c.y, transform: 'translate(-50%, -50%)' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="#3B82F6"><path d="M2 2l20 7-9 2-2 9z"/></svg>
          <span style={{ marginLeft: 6, background: 'rgba(255,255,255,0.95)', color: '#111', fontWeight: 600, fontSize: 12, borderRadius: 6, padding: '2px 8px', border: '1px solid #ddd' }}>{c.username}</span>
        </div>
      ))}
    </div>
  );
}