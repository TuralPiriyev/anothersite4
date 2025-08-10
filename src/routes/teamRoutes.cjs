const express = require('express');
const router = express.Router();
const { inviteMember, acceptInvitation, leaveTeam, removeMember, getMyTeams, upsertScript, createTeam } = require('../controllers/teamController.cjs');

router.get('/mine', getMyTeams);
router.post('/', createTeam);
router.post('/:teamId/invite', inviteMember);
router.post('/:teamId/accept', acceptInvitation);
router.post('/:teamId/leave', leaveTeam);
router.delete('/:teamId/members/:memberId', removeMember);
router.put('/:teamId/scripts', upsertScript);

module.exports = router;