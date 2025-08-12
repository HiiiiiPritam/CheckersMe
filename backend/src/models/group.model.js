// models/Group.js
const mongoose = require('mongoose');
const mongooseDelete = require('mongoose-delete');
const GroupMember = require('./groupMember.model.js');
const Constants = require('../constants/index.js');

const groupSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    minlength: 1,
    maxlength: 100
  },
  description: {
    type: String,
    trim: true,
    maxlength: 500,
    default: ''
  },
  groupPicture: {
    type: String,
    default: null
  },
  creator: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  admin: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    default: null
  },
  conversationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Conversation',
    required: true,
    unique: true 
  },
  franchiseIds: [{ 
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }],
}, {
  timestamps: true
});

groupSchema.plugin(mongooseDelete, {
  deletedAt: true,
  deletedBy: true,
  overrideMethods: true
});

groupSchema.index({ creator: 1 });
groupSchema.index({ conversationId: 1 });
groupSchema.index({ name: 1 });

groupSchema.virtual('memberCount', {
  ref: 'GroupMember',
  localField: '_id',
  foreignField: 'groupId',
  count: true
});

groupSchema.statics.findGroupsForUser = async function(userId) {
  const userMemberships = await GroupMember.find({ userId: userId }).select('groupId');
  const groupIds = userMemberships.map(membership => membership.groupId);

  return this.find({ _id: { $in: groupIds }, deleted: { $ne: true } })
             .populate('creator', 'name email')
             .populate('admin', 'name email');
};

groupSchema.statics.addMember = async function(groupId, userId, role = Constants.USER_ROLES.MEMBER) {
  const existingMember = await GroupMember.findOne({ groupId, userId })
  if (existingMember) {
    throw new Error('User is already a member of this group.');
  }
  const newMember = new GroupMember({ groupId, userId, role });
  await newMember.save();
  return newMember
};

groupSchema.statics.removeMember = async function(groupId, userId) {
  const member = await GroupMember.deleteOne({ groupId, userId })
  return member.deletedCount > 0;
};

// Update a member's role
groupSchema.statics.updateMemberRole = async function(groupId, userId, newRole) {
  if (![Constants.USER_ROLES.ADMIN, Constants.USER_ROLES.MEMBER].includes(newRole)) {
    throw new Error('Invalid role specified.');
  }
  const groupMember = await GroupMember.findOneAndUpdate(
    { groupId, userId },
    { role: newRole },
    { new: true }
  );

  if (!groupMember) {
    throw new Error('Member not found in this group.');
  }

  if(newRole === Constants.USER_ROLES.ADMIN) {
    const group = await this.findById(groupId);
    if (!group) {
      throw new Error('Group not found.');
    }
    const existingAdmin = await GroupMember.findOne({ groupId, role: Constants.USER_ROLES.ADMIN });
    if (existingAdmin && existingAdmin.userId.toString() !== userId.toString()) {
      existingAdmin.role = Constants.USER_ROLES.MEMBER;
      await existingAdmin.save();
    }

    group.admin = userId;
    await group.save();
  }
  return groupMember;
};

// Get all members of a group
groupSchema.statics.getGroupMembers = async function(groupId) {
  const members = await GroupMember.find({ groupId })
    .populate('userId', 'name email')
  return members;
};


module.exports = mongoose.model('Group', groupSchema);