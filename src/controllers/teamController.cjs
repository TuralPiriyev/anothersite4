const crypto = require('crypto');
const nodemailer = require('nodemailer');
const Team = require('../models/Team.cjs');

const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';

function buildTransporter() {
  try {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: process.env.SMTP_USER && process.env.SMTP_PASS ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined
    });
  } catch (e) {
    return null;
  }
}

async function inviteMember(req, res) {
  try {
    const { teamId } = req.params;
    const { email, role } = req.body;
    const requesterId = req.user?._id || req.userId;

    if (!email || !['editor','viewer'].includes(role)) {
      return res.status(400).json({ error: 'email və düzgün role tələb olunur' });
    }

    const team = await Team.findById(teamId);
    if (!team) return res.status(404).json({ error: 'Team tapılmadı' });
    if (!team.owner.equals(requesterId)) return res.status(403).json({ error: 'Yalnız owner invite edə bilər' });

    const code = crypto.randomBytes(4).toString('hex');
    team.invitations.push({ email, code, role, status: 'pending' });
    await team.save();

    const transporter = buildTransporter();
    if (transporter) {
      try {
        const acceptUrl = `${FRONTEND_ORIGIN}/teams/accept?teamId=${teamId}&code=${code}`;
        await transporter.sendMail({
          from: process.env.SMTP_USER,
          to: email,
          subject: `Invitation to join ${team.name}`,
          text: `Code: ${code} — ${acceptUrl}`
        });
      } catch (e) {
        console.warn('Email send failed:', e.message);
      }
    }

    return res.status(201).json({ success: true, teamId, email, role, code });
  } catch (err) {
    console.error('inviteMember error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

async function acceptInvitation(req, res) {
  try {
    const { teamId } = req.params;
    const { code } = req.body;
    const userId = req.user?._id || req.userId;

    if (!code) return res.status(400).json({ error: 'code tələb olunur' });

    const team = await Team.findById(teamId);
    if (!team) return res.status(404).json({ error: 'Team tapılmadı' });

    const invite = team.invitations.find(i => i.code === code && i.status === 'pending');
    if (!invite) return res.status(400).json({ error: 'Kod yalnış və ya istifadə olunub' });

    const isMember = team.members.some(m => m.user.equals(userId));
    if (!isMember) team.members.push({ user: userId, role: invite.role });
    invite.status = 'accepted';
    await team.save();

    const populated = await Team.findById(teamId).populate('members.user', 'username email').populate('owner', 'username email');
    return res.json({ success: true, team: populated });
  } catch (err) {
    console.error('acceptInvitation error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

async function leaveTeam(req, res) {
  try {
    const { teamId } = req.params;
    const userId = req.user?._id || req.userId;
    const team = await Team.findById(teamId);
    if (!team) return res.status(404).json({ error: 'Team tapılmadı' });
    await team.leave(userId);
    return res.json({ success: true });
  } catch (err) {
    console.error('leaveTeam error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

async function removeMember(req, res) {
  try {
    const { teamId, memberId } = req.params;
    const requesterId = req.user?._id || req.userId;
    const team = await Team.findById(teamId);
    if (!team) return res.status(404).json({ error: 'Team tapılmadı' });
    await team.removeMember(memberId, requesterId);
    return res.json({ success: true });
  } catch (err) {
    return res.status(403).json({ error: err.message || 'Server error' });
  }
}

async function getMyTeams(req, res) {
  try {
    const userId = req.user?._id || req.userId;
    const teams = await Team.findByUser(userId)
      .populate('owner', 'username email')
      .populate('members.user', 'username email');
    return res.json(teams);
  } catch (err) {
    console.error('getMyTeams error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

async function upsertScript(req, res) {
  try {
    const { teamId } = req.params;
    const { name, language = 'sql', content = '' } = req.body;
    const userId = req.user?._id || req.userId;
    if (!name) return res.status(400).json({ error: 'name tələb olunur' });
    const team = await Team.findById(teamId);
    if (!team) return res.status(404).json({ error: 'Team tapılmadı' });
    const idx = team.scripts.findIndex(s => s.name === name);
    if (idx >= 0) {
      team.scripts[idx].content = content;
      team.scripts[idx].language = language;
      team.scripts[idx].updatedBy = userId;
      team.scripts[idx].updatedAt = new Date();
    } else {
      team.scripts.push({ name, language, content, updatedBy: userId, updatedAt: new Date() });
    }
    await team.save();
    const populated = await Team.findById(teamId).populate('owner', 'username email').populate('members.user', 'username email');
    return res.json({ success: true, team: populated });
  } catch (err) {
    console.error('upsertScript error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

module.exports = { inviteMember, acceptInvitation, leaveTeam, removeMember, getMyTeams, upsertScript };