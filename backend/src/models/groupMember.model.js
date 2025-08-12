const mongoose = require('mongoose');
const mongooseDelete = require('mongoose-delete');
const { USER_ROLES } = require('../constants');

const groupMemberSchema = new mongoose.Schema({
  groupId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group',
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  role: {
    type: String,
    enum: [USER_ROLES.ADMIN, USER_ROLES.MEMBER],
    default: USER_ROLES.MEMBER
  },
  joinedAt: {
    type: Date,
    default: Date.now
  },
  lastSeenMessageId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message',
    default: null
  },
}, {
  timestamps: true
});

groupMemberSchema.plugin(mongooseDelete, {
  deletedAt: true,
  deletedBy: true,
  overrideMethods: true
});

// Ensure a user can only be a member of a group once
groupMemberSchema.index({ groupId: 1, userId: 1 }, { unique: true });
groupMemberSchema.index({ userId: 1 });
groupMemberSchema.index({ groupId: 1 });

module.exports = mongoose.model('GroupMember', groupMemberSchema);