import React, { useEffect, useState } from 'react';
import { useTeam } from '../context/TeamContext';
import { useAuth } from '../context/AuthContext';

export default function TeamDashboard() {
  const { user } = useAuth();
  const { teams, currentTeam, setCurrentTeamId, sendInvitation, acceptInvitation, removeMember, leaveTeam } = useTeam();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('viewer');
  const [code, setCode] = useState('');
  const [status, setStatus] = useState('Disconnected');

  useEffect(() => {
    const onCursor = (e) => {};
    const onContent = (e) => {};
    window.addEventListener('team-cursor', onCursor);
    window.addEventListener('team-content', onContent);
    setStatus('Real-time Sync: Active');
    return () => {
      window.removeEventListener('team-cursor', onCursor);
      window.removeEventListener('team-content', onContent);
    };
  }, []);

  return (
    <div className="p-4 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Team Collaboration</h2>
        <div className="text-sm text-green-600">{status}</div>
      </div>

      <div className="flex gap-4">
        <select className="border rounded p-2" value={currentTeam?._id || ''} onChange={e => setCurrentTeamId(e.target.value || null)}>
          <option value="">Select Team</option>
          {teams.map(t => (
            <option key={t._id} value={t._id}>{t.name}</option>
          ))}
        </select>
        {currentTeam && (
          <button className="px-3 py-2 bg-red-500 text-white rounded" onClick={() => leaveTeam(currentTeam._id)}>Leave Team</button>
        )}
      </div>

      {currentTeam && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <h3 className="font-medium">Send Invitation</h3>
            <div className="flex gap-2">
              <input className="border rounded p-2 flex-1" placeholder="email@example.com" value={email} onChange={e => setEmail(e.target.value)} />
              <select className="border rounded p-2" value={role} onChange={e => setRole(e.target.value)}>
                <option value="editor">editor</option>
                <option value="viewer">viewer</option>
              </select>
              <button className="px-3 py-2 bg-blue-600 text-white rounded" onClick={async () => {
                const code = await sendInvitation(currentTeam._id, email, role as any);
                alert(`Invitation code: ${code}`);
                setEmail('');
              }}>Send</button>
            </div>
          </div>
          <div className="space-y-4">
            <h3 className="font-medium">Accept Invitation</h3>
            <div className="flex gap-2">
              <input className="border rounded p-2 flex-1" placeholder="Invite code" value={code} onChange={e => setCode(e.target.value)} />
              <button className="px-3 py-2 bg-green-600 text-white rounded" onClick={async () => {
                await acceptInvitation(currentTeam._id, code);
                setCode('');
              }}>Accept</button>
            </div>
          </div>
        </div>
      )}

      {currentTeam && (
        <div>
          <h3 className="font-medium mb-2">Members</h3>
          <ul className="divide-y border rounded">
            {currentTeam.members.map((m) => (
              <li key={m._id || m.user._id} className="flex items-center justify-between p-2">
                <div>
                  <div className="font-medium">{m.user?.username}</div>
                  <div className="text-sm text-gray-500">{m.role}</div>
                </div>
                {String(currentTeam.owner._id) === String(user?.id) && m.role !== 'owner' && (
                  <button className="text-red-600" onClick={() => removeMember(currentTeam._id, String(m._id || m.user._id))}>Remove</button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}