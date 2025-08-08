import { Router } from 'express';
import { inviteMember, acceptInvitation, leaveTeam, removeMember, getMyTeams, upsertScript } from '../controllers/teamController.js';

const router = Router();

router.get('/mine', getMyTeams);
router.post('/:teamId/invite', inviteMember);
router.post('/:teamId/accept', acceptInvitation);
router.post('/:teamId/leave', leaveTeam);
router.delete('/:teamId/members/:memberId', removeMember);
router.put('/:teamId/scripts', upsertScript);

export default router;