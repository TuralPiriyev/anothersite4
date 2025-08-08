import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import io, { Socket } from 'socket.io-client';
import api from '../utils/api';
import { useAuth } from './AuthContext';

interface TeamMember { _id?: string; user: { _id: string; username: string }; role: 'owner'|'editor'|'viewer'; }
interface Invitation { email: string; code: string; role: 'editor'|'viewer'; status: 'pending'|'accepted'|'revoked'; }
interface Team { _id: string; name: string; owner: { _id: string; username: string }; members: TeamMember[]; invitations: Invitation[]; }

interface TeamContextType {
  teams: Team[];
  currentTeam: Team | null;
  members: TeamMember[];
  invitations: Invitation[];
  fetchMyTeams: () => Promise<void>;
  setCurrentTeamId: (teamId: string | null) => void;
  sendInvitation: (teamId: string, email: string, role: 'editor'|'viewer') => Promise<string>;
  acceptInvitation: (teamId: string, code: string) => Promise<void>;
  removeMember: (teamId: string, memberId: string) => Promise<void>;
  leaveTeam: (teamId: string) => Promise<void>;
  broadcastCursor: (x: number, y: number) => void;
}

const TeamContext = createContext<TeamContextType | undefined>(undefined);

export const TeamProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [teams, setTeams] = useState<Team[]>([]);
  const [currentTeamId, setCurrentTeamIdState] = useState<string | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);

  const currentTeam = useMemo(() => teams.find(t => t._id === currentTeamId) || null, [teams, currentTeamId]);
  const members = currentTeam?.members || [];
  const invitations = currentTeam?.invitations || [];

  useEffect(() => {
    fetchMyTeams();
  }, []);

  useEffect(() => {
    if (!currentTeamId || !user) return;
    // create socket connection on demand
    const s = io('/', { path: '/socket.io', withCredentials: true, transports: ['websocket'] });
    setSocket(s);
    s.emit('joinTeam', { teamId: currentTeamId, userId: user.id });

    s.on('team:members:update', (payload: any) => {
      if (payload.type === 'join' || payload.type === 'leave' || payload.type === 'disconnect') {
        fetchMyTeams();
      }
    });
    s.on('team:cursors:update', (cursor: { userId: string; username: string; x: number; y: number }) => {
      // could be handled by a dedicated UI overlay
      window.dispatchEvent(new CustomEvent('team-cursor', { detail: cursor }));
    });
    s.on('team:content:update', (data: any) => {
      window.dispatchEvent(new CustomEvent('team-content', { detail: data }));
    });

    return () => {
      s.emit('leaveTeam', { teamId: currentTeamId, userId: user.id });
      s.disconnect();
      setSocket(null);
    };
  }, [currentTeamId, user?.id]);

  async function fetchMyTeams() {
    const { data } = await api.get('/teams/mine');
    setTeams(data);
    if (!currentTeamId && data.length > 0) setCurrentTeamIdState(data[0]._id);
  }

  function setCurrentTeamId(teamId: string | null) {
    setCurrentTeamIdState(teamId);
  }

  async function sendInvitation(teamId: string, email: string, role: 'editor'|'viewer') {
    const { data } = await api.post(`/teams/${teamId}/invite`, { email, role });
    await fetchMyTeams();
    return data.code;
  }

  async function acceptInvitation(teamId: string, code: string) {
    await api.post(`/teams/${teamId}/accept`, { code });
    await fetchMyTeams();
    if (user && socket) {
      socket.emit('joinTeam', { teamId, userId: user.id });
    }
  }

  async function removeMember(teamId: string, memberId: string) {
    await api.delete(`/teams/${teamId}/members/${memberId}`);
    await fetchMyTeams();
  }

  async function leaveTeam(teamId: string) {
    await api.post(`/teams/${teamId}/leave`);
    if (user && socket) socket.emit('leaveTeam', { teamId, userId: user.id });
    await fetchMyTeams();
    if (currentTeamId === teamId) setCurrentTeamIdState(null);
  }

  function broadcastCursor(x: number, y: number) {
    if (socket && currentTeamId && user) {
      socket.emit('cursorMove', { teamId: currentTeamId, userId: user.id, x, y });
    }
  }

  return (
    <TeamContext.Provider value={{ teams, currentTeam, members, invitations, fetchMyTeams, setCurrentTeamId, sendInvitation, acceptInvitation, removeMember, leaveTeam, broadcastCursor }}>
      {children}
    </TeamContext.Provider>
  );
};

export const useTeam = () => {
  const ctx = useContext(TeamContext);
  if (!ctx) throw new Error('useTeam must be used within TeamProvider');
  return ctx;
};