import mongoose from 'mongoose';

const TeamSchema = new mongoose.Schema({
  name: { type: String, required: true },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  members: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: ['owner','editor','viewer'], default: 'viewer' }
  }],
  invitations: [{
    email: { type: String, required: true },
    code: { type: String, required: true },
    role: { type: String, enum: ['editor','viewer'], default: 'viewer' },
    status: { type: String, enum: ['pending','accepted','revoked'], default: 'pending' }
  }],
  scripts: [{
    name: { type: String, required: true },
    language: { type: String, enum: ['sql','js','json','text'], default: 'sql' },
    content: { type: String, default: '' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedAt: { type: Date, default: Date.now }
  }]
}, { timestamps: true });

TeamSchema.methods.leave = function(userId) {
  this.members = this.members.filter(m => !m.user.equals(userId));
  return this.save();
};

TeamSchema.methods.removeMember = function(memberId, requesterId) {
  if (!this.owner.equals(requesterId)) {
    throw new Error('Yalnız owner üzv silə bilər');
  }
  this.members = this.members.filter(m => m.user.toString() !== memberId);
  return this.save();
};

TeamSchema.statics.findByUser = function(userId) {
  return this.find({ 'members.user': userId });
};

export default mongoose.model('Team', TeamSchema);