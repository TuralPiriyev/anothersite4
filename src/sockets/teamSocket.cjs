// src/sockets/teamSocket.cjs

/**
 * registerTeamSocket(io)
 * Bu modul Socket.IO ilə "Team Collaboration" funksionallığını təmin edir.
 * Hər bir team üçün ayrı namespace yaradır və connection, join, leave,
 * cursor move event-lərini idarə edir.
 */
function registerTeamSocket(io) {
  // /team namespace-i
  const teamNs = io.of('/team');

  teamNs.on('connection', socket => {
    console.log('🟢 Yeni team socket bağlantısı:', socket.id);

    // İstifadəçi komandaya qoşulduqda
    socket.on('joinTeam', ({ teamId, userId, username }) => {
      socket.join(teamId);
      console.log(`⚡️ [${username || userId}] qoşuldu team ${teamId}-ə`);
      // Komanda üzvlərinə siyahının yeniləndiyini bildir
      teamNs.to(teamId).emit('team:members:update', { teamId });
    });

    // İstifadəçi kursorunu hərəkət etdirdikdə
    socket.on('cursorMove', ({ teamId, userId, username, x, y }) => {
      teamNs.to(teamId).emit('team:cursors:update', {
        userId,
        username,
        x,
        y
      });
    });

    // İstifadəçi komandadan çıxdıqda
    socket.on('leaveTeam', ({ teamId, userId, username }) => {
      socket.leave(teamId);
      console.log(`❌ [${username || userId}] ayrıldı team ${teamId}-dən`);
      teamNs.to(teamId).emit('team:members:update', { teamId });
    });

    // Socket disconnect olduqda
    socket.on('disconnect', reason => {
      console.log(`🔌 Socket ${socket.id} ayrıldı:`, reason);
    });
  });
}

// Default eksport: funksiyanın özü
module.exports = registerTeamSocket;
