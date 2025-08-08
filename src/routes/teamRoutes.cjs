const express = require('express');
const router = express.Router();
const { inviteMember, acceptInvitation, leaveTeam, removeMember, getMyTeams, createTeam, getTeam } = require('../controllers/teamController.cjs');

// Create & Get teams
router.post('/', createTeam);
router.get('/mine', getMyTeams);
router.get('/:teamId', getTeam);

// Invite & Accept
router.post('/:teamId/invite', inviteMember);
router.post('/:teamId/accept', acceptInvitation);

// Members
router.post('/:teamId/leave', leaveTeam);
router.delete('/:teamId/members/:memberId', removeMember);

module.exports = router;