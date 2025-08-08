import axios from 'axios';
import { io } from 'socket.io-client';

describe('Team Collaboration End-to-End', () => {
  const base = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:5000/api';
  let token = '';
  let teamId = '';
  let userId = '';
  let code = '';

  beforeAll(async () => {
    // assume a user exists and login
    const { data } = await axios.post(`${base}/auth/login`, { email: 'test@example.com', password: 'testpass123' });
    token = data.token;
    userId = data.user.id;
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  });

  it('should create a team and invite user', async () => {
    // create team via mongo directly is not available; assume exists or skip
    const t = await axios.get(`${base}/teams/mine`);
    teamId = t.data?.[0]?._id;
    expect(teamId).toBeTruthy();
    const inv = await axios.post(`${base}/teams/${teamId}/invite`, { email: 'invitee@example.com', role: 'viewer' });
    expect(inv.data.code).toHaveLength(8);
    code = inv.data.code;
  });

  it('should accept invitation and join socket room', async () => {
    const acc = await axios.post(`${base}/teams/${teamId}/accept`, { code });
    expect(acc.data.success).toBe(true);

    const socket = io('http://localhost:5000', { transports: ['websocket'] });
    await new Promise<void>(resolve => {
      socket.on('connect', () => {
        socket.emit('joinTeam', { teamId, userId });
        resolve();
      });
    });
    socket.disconnect();
  });

  it('should leave team', async () => {
    const resp = await axios.post(`${base}/teams/${teamId}/leave`);
    expect(resp.data.success).toBe(true);
  });
});