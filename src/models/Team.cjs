const mongoose = require('mongoose');
const crypto = require('crypto');

const TeamSchema = new mongoose.Schema({
  name: { type: String, required: true },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  members: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    role: { type: String, enum: ['owner','editor','viewer'], default: 'viewer' }
  }],
  invitations: [{
    email: String,
    code: String,
    role: { type: String, enum: ['editor','viewer'], default: 'viewer' },
    status: { type: String, enum: ['pending','accepted','revoked'], default: 'pending' }
  }]
}, { timestamps: true });

// Methods
TeamSchema.methods.leave = async function leave(userId) {
  const before = this.members.length;
  this.members = this.members.filter(m => String(m.user) !== String(userId));
  const changed = this.members.length !== before;
  if (changed) await this.save();
  return changed;
};

TeamSchema.methods.removeMember = async function removeMember(requestingUserId, memberId) {
  if (String(this.owner) !== String(requestingUserId)) {
    const err = new Error('Only owner can remove members');
    err.status = 403;
    throw err;
  }
  const before = this.members.length;
  this.members = this.members.filter(m => String(m._id || m.user) !== String(memberId));
  const changed = this.members.length !== before;
  if (changed) await this.save();
  return changed;
};

// Statics
TeamSchema.statics.findByUser = function findByUser(userId) {
  return this.find({
    $or: [
      { owner: userId },
      { 'members.user': userId }
    ]
  }).populate('owner', 'username email').populate('members.user', 'username email');
};

// Helper to add invitation
TeamSchema.methods.addInvitation = async function addInvitation(email, role) {
  const code = crypto.randomBytes(4).toString('hex');
  this.invitations.push({ email, role, code, status: 'pending' });
  await this.save();
  return code;
};

module.exports = mongoose.model('Team', TeamSchema);