// src/models/User.js
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3,
    maxlength: 30
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  role: {
    type: String,
    enum: ['admin', 'editor', 'viewer'],
    default: 'editor'
  },
  avatar: {
    type: String,
    default: null
  },
  color: {
    type: String,
    default: '#3B82F6'
  },
  isOnline: {
    type: Boolean,
    default: false
  },
  lastSeen: {
    type: Date,
    default: Date.now
  },
  currentWorkspace: {
    type: String,
    default: null
  },
  presence: {
    type: String,
    enum: ['online', 'away', 'busy', 'offline'],
    default: 'offline'
  },
  currentAction: {
    type: String,
    default: null
  },
  preferences: {
    theme: {
      type: String,
      enum: ['light', 'dark', 'auto'],
      default: 'auto'
    },
    notifications: {
      type: Boolean,
      default: true
    },
    collaboration: {
      showCursors: {
        type: Boolean,
        default: true
      },
      showPresence: {
        type: Boolean,
        default: true
      }
    }
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Index for efficient querying
userSchema.index({ email: 1 });
userSchema.index({ username: 1 });
userSchema.index({ isOnline: 1 });
userSchema.index({ currentWorkspace: 1 });

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(this.password, 10);
  }
  next();
});

// Generate user color based on username
userSchema.pre('save', function(next) {
  if (!this.color) {
    const colors = [
      '#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6',
      '#06B6D4', '#84CC16', '#F97316', '#EC4899', '#6366F1'
    ];
    const hash = this.username.split('').reduce((a, b) => {
      a = ((a << 5) - a) + b.charCodeAt(0);
      return a & a;
    }, 0);
    this.color = colors[Math.abs(hash) % colors.length];
  }
  next();
});

// Method to compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Method to update online status
userSchema.methods.updateOnlineStatus = async function(isOnline, workspaceId = null) {
  this.isOnline = isOnline;
  this.lastSeen = new Date();
  if (workspaceId) {
    this.currentWorkspace = workspaceId;
  }
  return this.save();
};

// Method to update presence
userSchema.methods.updatePresence = async function(presence, currentAction = null) {
  this.presence = presence;
  this.currentAction = currentAction;
  this.lastSeen = new Date();
  return this.save();
};

// Static method to get online users
userSchema.statics.getOnlineUsers = function() {
  return this.find({ isOnline: true }).select('username email avatar color currentWorkspace presence currentAction lastSeen');
};

// Static method to get users by workspace
userSchema.statics.getUsersByWorkspace = function(workspaceId) {
  return this.find({ currentWorkspace: workspaceId }).select('username email avatar color presence currentAction lastSeen');
};

module.exports = mongoose.model('User', userSchema);
