import React, { useEffect, useState } from 'react';
import { useTeam } from '../context/TeamContext.js';
import { useAuth } from '../context/AuthContext.js';
import InvitationForm from './InvitationForm.jsx';
import TeamMembersList from './TeamMembersList.jsx';
import api from '../utils/api.js';

export default function TeamDashboard() {
  const { user } = useAuth();
  const { teams, currentTeam, setCurrentTeamId, createTeam, acceptInvitation, leaveTeam } = useTeam();
  const [code, setCode] = useState('');
  const [status, setStatus] = useState('Disconnected');
  const [newTeamName, setNewTeamName] = useState('My Team');
  const [scriptName, setScriptName] = useState('schema.sql');
  const [scriptContent, setScriptContent] = useState('');

  const isOwner = currentTeam && String(currentTeam.owner._id) === String(user?.id);
  const canEdit = isOwner || (currentTeam?.members || []).some(m => String(m.user?._id) === String(user?.id) && m.role === 'editor');

  useEffect(() => {
    setStatus('Real-time Sync: Active');
    if (currentTeam) {
      const exist = currentTeam.scripts?.find(s => s.name === scriptName);
      setScriptContent(exist?.content || '');
    }
  }, [currentTeam, scriptName]);

  async function saveScript() {
    if (!currentTeam) return;
    await api.put(`/teams/${currentTeam._id}/scripts`, { name: scriptName, language: 'sql', content: scriptContent });
  }

  return (
    <div className="p-4 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Team Collaboration</h2>
        <div className="text-sm text-green-600">{status}</div>
      </div>

      {/* Team create */}
      <div className="flex gap-2 items-center">
        <input className="border rounded p-2" placeholder="New team name" value={newTeamName} onChange={e => setNewTeamName(e.target.value)} />
        <button className="px-3 py-2 bg-indigo-600 text-white rounded" onClick={() => createTeam(newTeamName)}>Create Team</button>
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
            <InvitationForm teamId={currentTeam._id} />
            <h3 className="font-medium">Accept Invitation</h3>
            <div className="flex gap-2">
              <input className="border rounded p-2 flex-1" placeholder="Invite code" value={code} onChange={e => setCode(e.target.value)} />
              <button className="px-3 py-2 bg-green-600 text-white rounded" onClick={async () => { await acceptInvitation(currentTeam._id, code); setCode(''); }}>Accept</button>
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="font-medium">Team Members</h3>
            <TeamMembersList team={currentTeam} />
          </div>
        </div>
      )}

      {currentTeam && (
        <div className="space-y-3">
          <h3 className="font-medium">Active Script</h3>
          <div className="flex gap-2 items-center">
            <input className="border rounded p-2" value={scriptName} onChange={e => setScriptName(e.target.value)} />
            {canEdit && <button className="px-3 py-2 bg-blue-600 text-white rounded" onClick={saveScript}>Save</button>}
          </div>
          <textarea
            className="w-full h-64 border rounded p-2 font-mono"
            value={scriptContent}
            onChange={e => setScriptContent(e.target.value)}
            readOnly={!canEdit}
          />
        </div>
      )}
    </div>
  );
}