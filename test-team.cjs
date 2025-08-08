const axios = require('axios');
const { io } = require('socket.io-client');

const BASE = process.env.API || 'http://localhost:5000/api';

(async () => {
  try {
    console.log('Team Collaboration quick test');
    // Login existing seeded user
    const { data: login } = await axios.post(`${BASE}/auth/login`, { email: 'test@example.com', password: 'testpass123' });
    const token = login.token;
    const userId = login.user.id;
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;

    // Create a team for this test
    const { data: created } = await axios.post(`${BASE}/teams`, { name: 'Demo Team' });
    const teamId = created._id;

    // Invite someone
    const { data: inv } = await axios.post(`${BASE}/teams/${teamId}/invite`, { email: 'invitee@example.com', role: 'viewer' });
    console.log('Invite code:', inv.code);

    // Accept as current user (for demo)
    const { data: acc } = await axios.post(`${BASE}/teams/${teamId}/accept`, { code: inv.code });
    console.log('Accepted:', acc.success);

    // Socket join and broadcast cursor
    const socket = io('http://localhost:5000', { transports: ['websocket'] });
    await new Promise(resolve => socket.on('connect', resolve));
    socket.emit('joinTeam', { teamId, userId });

    socket.on('team:cursors:update', payload => {
      console.log('Cursor update received:', payload);
    });

    socket.emit('cursorMove', { teamId, userId, x: 100, y: 200 });

    setTimeout(() => {
      socket.disconnect();
      console.log('Done');
      process.exit(0);
    }, 1000);
  } catch (e) {
    console.error('Test failed:', e.response?.data || e.message);
    process.exit(1);
  }
})();