const User = require('../models/User.cjs');
const Team = require('../models/Team.cjs');

module.exports = function registerTeamSocket(io) {
  io.on('connection', (socket) => {
    // Join a team room
    socket.on('joinTeam', async ({ teamId, userId }) => {
      try {
        if (!teamId || !userId) return;
        const user = await User.findById(userId, 'username');
        if (!user) return;

        // Validate membership
        const team = await Team.findById(teamId);
        if (!team) return;
        const isMember = String(team.owner) === String(userId) || team.members.some(m => String(m.user) === String(userId));
        if (!isMember) return; // do not join non-members

        socket.join(`team:${teamId}`);
        socket.data.teamId = teamId;
        socket.data.userId = userId;
        socket.data.username = user.username;

        io.to(`team:${teamId}`).emit('team:members:update', { type: 'join', userId, username: user.username });
      } catch (e) {
        console.error('joinTeam error:', e.message);
      }
    });

    socket.on('leaveTeam', ({ teamId, userId }) => {
      try {
        socket.leave(`team:${teamId}`);
        io.to(`team:${teamId}`).emit('team:members:update', { type: 'leave', userId });
      } catch (e) {
        console.error('leaveTeam error:', e.message);
      }
    });

    socket.on('cursorMove', async ({ teamId, userId, x, y }) => {
      try {
        if (!teamId || !userId) return;
        const user = await User.findById(userId, 'username');
        const payload = { userId, username: user?.username || 'Unknown', x, y };
        socket.to(`team:${teamId}`).emit('team:cursors:update', payload);
      } catch (e) {
        console.error('cursorMove error:', e.message);
      }
    });

    socket.on('contentChange', ({ teamId, data }) => {
      try {
        if (!teamId) return;
        socket.to(`team:${teamId}`).emit('team:content:update', data);
      } catch (e) {
        console.error('contentChange error:', e.message);
      }
    });

    socket.on('disconnect', () => {
      const teamId = socket.data?.teamId;
      const userId = socket.data?.userId;
      if (teamId && userId) {
        io.to(`team:${teamId}`).emit('team:members:update', { type: 'disconnect', userId });
      }
    });
  });
};