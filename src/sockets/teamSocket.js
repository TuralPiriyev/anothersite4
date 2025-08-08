import { Server } from 'socket.io';
import Team from '../models/Team.js';
import User from '../models/User.cjs';

export default function registerTeamSocket(server) {
  const io = new Server(server, {
    cors: {
      origin: [
        'https://startup-1-j563.onrender.com',
        'http://localhost:5173',
        'http://localhost:3000'
      ],
      credentials: true
    }
  });
  const teamNs = io.of('/team');

  teamNs.on('connection', socket => {
    socket.on('joinTeam', async ({ teamId, userId }) => {
      try {
        socket.join(teamId);
        const team = await Team.findById(teamId).populate('members.user', 'username');
        teamNs.to(teamId).emit('team:members:update', team?.members || []);
      } catch (e) {
        console.error('joinTeam error:', e.message);
      }
    });

    socket.on('cursorMove', async ({ teamId, userId, x, y }) => {
      try {
        const user = await User.findById(userId, 'username');
        teamNs.to(teamId).emit('team:cursors:update', { userId, username: user?.username || 'User', x, y });
      } catch (e) {
        console.error('cursorMove error:', e.message);
      }
    });

    socket.on('leaveTeam', async ({ teamId }) => {
      try {
        socket.leave(teamId);
        const team = await Team.findById(teamId).populate('members.user', 'username');
        teamNs.to(teamId).emit('team:members:update', team?.members || []);
      } catch (e) {
        console.error('leaveTeam error:', e.message);
      }
    });
  });

  return io;
}