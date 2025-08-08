import React, { useState } from 'react';
import { useTeam } from '../context/TeamContext';

export default function InvitationForm({ teamId }) {
  const { sendInvitation } = useTeam();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('viewer');
  const [code, setCode] = useState('');

  async function onSubmit(e) {
    e.preventDefault();
    const c = await sendInvitation(teamId, email, role);
    setCode(c);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <input className="border rounded p-2 w-full" placeholder="email@example.com" value={email} onChange={e => setEmail(e.target.value)} />
      <select className="border rounded p-2 w-full" value={role} onChange={e => setRole(e.target.value)}>
        <option value="editor">editor</option>
        <option value="viewer">viewer</option>
      </select>
      <button className="px-3 py-2 bg-blue-600 text-white rounded" type="submit">Send Invitation</button>
      {code && <div className="text-sm">Code: <code>{code}</code></div>}
    </form>
  );
}