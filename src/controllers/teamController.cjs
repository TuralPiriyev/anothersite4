const crypto = require('crypto');
const nodemailer = require('nodemailer');
const Team = require('../models/Team.cjs');
const User = require('../models/User.cjs');

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

exports.inviteMember = async (req, res) => {
  try {
    const { teamId } = req.params;
    const { email, role } = req.body;
    if (!email || !['editor','viewer'].includes(role)) {
      return res.status(400).json({ error: 'email and valid role are required' });
    }

    const team = await Team.findById(teamId);
    if (!team) return res.status(404).json({ error: 'Team not found' });
    if (String(team.owner) !== String(req.userId)) {
      return res.status(403).json({ error: 'Only owner can invite' });
    }

    const code = crypto.randomBytes(4).toString('hex');
    team.invitations.push({ email, code, role, status: 'pending' });
    await team.save();

    // Send email if transporter is configured
    const transporter = buildTransporter();
    if (transporter) {
      try {
        const acceptUrl = `${FRONTEND_ORIGIN}/teams/accept?teamId=${teamId}&code=${code}`;
        await transporter.sendMail({
          from: process.env.SMTP_USER,
          to: email,
          subject: `Invitation to join team ${team.name}`,
          text: `You have been invited to join team ${team.name} as ${role}. Use code ${code} or open ${acceptUrl}`
        });
      } catch (e) {
        // Non-blocking
        console.warn('Email send failed:', e.message);
      }
    }

    return res.status(201).json({ success: true, teamId, email, role, code });
  } catch (err) {
    console.error('inviteMember error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

exports.acceptInvitation = async (req, res) => {
  try {
    const { teamId } = req.params;
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'code is required' });

    const team = await Team.findById(teamId).populate('members.user', 'username').populate('owner', 'username');
    if (!team) return res.status(404).json({ error: 'Team not found' });

    const invite = team.invitations.find(i => i.code === code && i.status === 'pending');
    if (!invite) return res.status(400).json({ error: 'Invalid or already used code' });

    // Check if user already member
    const isMember = team.members.some(m => String(m.user) === String(req.userId));
    if (!isMember) {
      team.members.push({ user: req.userId, role: invite.role });
    }
    invite.status = 'accepted';
    await team.save();
    const populated = await Team.findById(teamId).populate('members.user', 'username email').populate('owner', 'username email');
    return res.json({ success: true, team: populated });
  } catch (err) {
    console.error('acceptInvitation error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

exports.leaveTeam = async (req, res) => {
  try {
    const { teamId } = req.params;
    const team = await Team.findById(teamId);
    if (!team) return res.status(404).json({ error: 'Team not found' });
    const changed = await team.leave(req.userId);
    return res.json({ success: true, changed });
  } catch (err) {
    console.error('leaveTeam error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

exports.removeMember = async (req, res) => {
  try {
    const { teamId, memberId } = req.params;
    const team = await Team.findById(teamId);
    if (!team) return res.status(404).json({ error: 'Team not found' });
    const changed = await team.removeMember(req.userId, memberId);
    return res.json({ success: true, changed });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || 'Server error' });
  }
};

exports.getMyTeams = async (req, res) => {
  try {
    const teams = await Team.findByUser(req.userId);
    return res.json(teams);
  } catch (err) {
    console.error('getMyTeams error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

exports.createTeam = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const team = await Team.create({ name, owner: req.userId, members: [{ user: req.userId, role: 'owner' }] });
    const populated = await Team.findById(team._id).populate('owner', 'username email').populate('members.user', 'username email');
    res.status(201).json(populated);
  } catch (err) {
    console.error('createTeam error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

exports.getTeam = async (req, res) => {
  try {
    const { teamId } = req.params;
    const team = await Team.findById(teamId).populate('owner', 'username email').populate('members.user', 'username email');
    if (!team) return res.status(404).json({ error: 'Team not found' });
    res.json(team);
  } catch (err) {
    console.error('getTeam error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};