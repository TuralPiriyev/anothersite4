import React from 'react';
import { useTeam } from '../context/TeamContext';
import { useAuth } from '../context/AuthContext';

export default function TeamMembersList({ team }) {
  const { removeMember } = useTeam();
  const { user } = useAuth();
  const isOwner = String(team.owner._id) === String(user?.id);

  const seen = new Set();
  const fullList = [
    { _id: team.owner._id, user: team.owner, role: 'owner', __isOwnerEntry: true },
    ...team.members
  ].filter(m => {
    const id = String(m.user?._id || m._id);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });

  return (
    <ul className="divide-y border rounded">
      {fullList.map((m) => (
        <li key={m._id || m.user._id} className="flex items-center justify-between p-2">
          <div>
            <div className="font-medium">{m.user?.username}</div>
            <div className="text-sm text-gray-500">{m.user?.email} — role: {m.role}</div>
          </div>
          {isOwner && m.role !== 'owner' && !m.__isOwnerEntry && (
            <button className="text-red-600" onClick={() => removeMember(team._id, String(m.user._id))}>Remove</button>
          )}
        </li>
      ))}
    </ul>
  );
}