// src/routes/teamRoutes.js

const express = require('express');
const router = express.Router();

const {
  inviteMember,
  acceptInvitation,
  leaveTeam,
  removeMember,
  getMyTeams
} = require('../controllers/teamController.cjs');

// İstifadəçinin öz komandalarını götür
router.get('/mine', getMyTeams);

// Davət göndərmə
router.post('/:teamId/invite', inviteMember);

// Davəti qəbul etmə
router.post('/:teamId/accept', acceptInvitation);

// Komandadan ayrılma
router.post('/:teamId/leave', leaveTeam);

// Üzv silmə (yalnız owner)
router.delete('/:teamId/members/:memberId', removeMember);

module.exports = router;
