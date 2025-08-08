import React, { useEffect, useState } from 'react';
import { Wifi, WifiOff, AlertCircle, Info } from 'lucide-react';

interface CollaborationStatusProps {
  isConnected: boolean;
  error?: string;
  showDetails?: boolean;
}

const CollaborationStatus: React.FC = () => {
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    function onContent() { setConnected(true); }
    window.addEventListener('team-content', onContent as EventListener);
    return () => window.removeEventListener('team-content', onContent as EventListener);
  }, []);
  return (
    <div className={`px-2 py-1 text-xs rounded ${connected ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
      {connected ? 'Real-time Sync Active' : 'Real-time Sync Offline'}
    </div>
  );
};

export default CollaborationStatus;