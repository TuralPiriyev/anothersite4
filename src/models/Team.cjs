// src/models/Team.cjs
const mongoose = require('mongoose');

const TeamSchema = new mongoose.Schema({
  name: { type: String, required: true },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  members: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: ['owner', 'editor', 'viewer'], default: 'viewer' }
  }],
  invitations: [{
    email: { type: String, required: true },
    code: { type: String, required: true },
    role: { type: String, enum: ['editor', 'viewer'], default: 'viewer' },
    status: { type: String, enum: ['pending', 'accepted', 'revoked'], default: 'pending' }
  }]
}, { timestamps: true });

const Team = mongoose.models.Team || mongoose.model('Team', TeamSchema);

module.exports = Team;
