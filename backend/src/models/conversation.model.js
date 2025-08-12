const mongoose = require("mongoose");
const mongooseDelete = require("mongoose-delete");
const Constants = require("../constants/index.js");
const GroupMember = require("./groupMember.model.js");
const Group = require("./group.model.js");
const conversationSchema = new mongoose.Schema(
  {
    participant1: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    participant2: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    groupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Group",
      default: null,
    },
    conversationType: {
      type: String,
      enum: Object.values(Constants.CONVERSATION_TYPES),
      default: Constants.CONVERSATION_TYPES.USER_TO_USER,
    },
    aiUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    lastMessage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
      default: null,
    },
    lastMessageAt: {
      type: Date,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    unreadCounts: {
      type: Map,
      of: Number,
      default: {}, // { 'userId1': 5, 'userId2': 0 }
    },
  },
  {
    timestamps: true,
  }
);

conversationSchema.plugin(mongooseDelete, {
  deletedAt: true,
  deletedBy: true,
  overrideMethods: true,
});

conversationSchema.index({ participant1: 1, participant2: 1 });
conversationSchema.index({ conversationType: 1 });
conversationSchema.index({ lastMessageAt: -1 });
conversationSchema.index({ isActive: 1 });

// Virtual for conversation title (for display purposes)
conversationSchema.virtual("title").get(async function () {
  // If it's a group conversation, return group name
  if (
    this.conversationType === Constants.CONVERSATION_TYPES.AI_TO_USER &&
    this.aiUserId
  ) {
    return "AI Assistant";
  } else if (
    this.conversationType === Constants.CONVERSATION_TYPES.GROUP &&
    this.groupId
  ) {
    try {
      await this.populate("groupId", "name");
      return this.groupId ? this.groupId.name : "Group Chat";
    } catch (error) {
      console.error("Error populating groupId in virtual 'title':", error);
      return "Group Chat (Error Loading Name)";
    }
  }
  return "Direct Message";
});

// Method to get the other participant in the conversation
conversationSchema.methods.getOtherParticipant = function (userId) {
  if (this.participant1.toString() === userId.toString()) {
    return this.participant2;
  }
  return this.participant1;
};

// Method to get participants in the conversation
conversationSchema.methods.getParticipants = async function () {
  if (this.conversationType != Constants.CONVERSATION_TYPES.GROUP) {
    return [this.participant1, this.participant2].filter(Boolean);
  } else if (
    this.conversationType === Constants.CONVERSATION_TYPES.GROUP &&
    this.groupId
  ) {
    const GroupMember = mongoose.model("GroupMember");
    const members = await GroupMember.find({ groupId: this.groupId }).select(
      "userId"
    );
    return members.map((member) => member.userId);
  }
  return [];
};

// Method to check if user is participant in this conversation
conversationSchema.methods.isParticipant = async function (userId) {
  if (this.conversationType != Constants.CONVERSATION_TYPES.GROUP) {
    return (
      this.participant1.toString() === userId.toString() ||
      this.participant2.toString() === userId.toString()
    );
  } else if (
    this.conversationType === Constants.CONVERSATION_TYPES.GROUP
  ) {    
    const group = await Group.findOne({ conversationId: this._id });
    if (!group) {
      throw new Error("Group not found for this conversation.");
    }

    const isMember = await GroupMember.exists({
      groupId: group._id,
      userId: userId,
    });
    return isMember !== null; 
  }
  return false;
};

// Method to get unread count for a specific user
// conversationSchema.methods.getUnreadCount = function(userId) {
//   if (this.participant1.toString() === userId.toString()) {
//     return this.unreadCounts.participant1;
//   }
//   return this.unreadCounts.participant2;
// };
conversationSchema.methods.getUnreadCount = function (userId) {
  return this.unreadCounts.get(userId.toString()) || 0;
};

// Method to increment unread count for a specific user
// conversationSchema.methods.incrementUnreadCount = function(userId) {
//   if (this.participant1.toString() === userId.toString()) {
//     this.unreadCounts.participant1 += 1;
//   } else {
//     this.unreadCounts.participant2 += 1;
//   }
//   return this.save();
// };
conversationSchema.methods.incrementUnreadCount = function (userId) {
  const currentCount = this.unreadCounts.get(userId.toString()) || 0;
  this.unreadCounts.set(userId.toString(), currentCount + 1);
  return this.save();
};

// // Method to reset unread count for a specific user
// conversationSchema.methods.resetUnreadCount = function(userId) {
//   if (this.participant1.toString() === userId.toString()) {
//     this.unreadCounts.participant1 = 0;
//   } else {
//     this.unreadCounts.participant2 = 0;
//   }
//   return this.save();
// };
// Method to reset unread count for a specific user
conversationSchema.methods.resetUnreadCount = function (userId) {
  this.unreadCounts.set(userId.toString(), 0);
  return this.save();
};

// Static method to find conversation between two users not for group
conversationSchema.statics.findConversationBetweenUsers = function (
  user1Id,
  user2Id
) {
  return this.findOne({
    $or: [
      { participant1: user1Id, participant2: user2Id },
      { participant1: user2Id, participant2: user1Id },
    ],
    conversationType: {
      $in: [
        Constants.CONVERSATION_TYPES.USER_TO_USER,
        Constants.CONVERSATION_TYPES.AI_TO_USER,
      ],
    },
    deleted: { $ne: true },
  });
};

// Static method to find group conversation
conversationSchema.statics.findGroupConversation = function (groupId) {
  return this.findOne({
    groupId: groupId,
    conversationType: Constants.CONVERSATION_TYPES.GROUP,
    deleted: {
      $ne: true,
    },
  });
};

// Static method to find conversations for a user
conversationSchema.statics.findUserConversations = async function (
  userId,
  options = {}
) {
  const { skip = 0, limit = Constants.CONVERSATION_PAGINATION_LIMIT } = options;

  const userGroupMemberships = await GroupMember.find({ userId: userId })
    .select("groupId")
    .lean();
  const groupIds = userGroupMemberships.map((gm) => gm.groupId);

  return this.find({
    $or: [
      // For direct messages
      { participant1: userId, conversationType: [Constants.CONVERSATION_TYPES.USER_TO_USER, Constants.CONVERSATION_TYPES.AI_TO_USER] }, { participant2: userId, conversationType: [Constants.CONVERSATION_TYPES.USER_TO_USER, Constants.CONVERSATION_TYPES.AI_TO_USER] },
      // For group messages
      {
        groupId: { $in: groupIds },
        conversationType: Constants.CONVERSATION_TYPES.GROUP,
      },
    ],
    deleted: {
      $ne: true,
    },
  })
    .populate("participant1", "name email")
    .populate("participant2", "name email")
    .populate("groupId", "name groupPicture")
    .populate("lastMessage", "content senderId createdAt messageType")
    .sort({
      lastMessageAt: -1,
      createdAt: -1,
    })
    .skip(skip)
    .limit(limit);
};

// Static method to count conversations for a user
conversationSchema.statics.countUserConversations = async function (userId) {
  const GroupMember = mongoose.model("GroupMember");
  const userGroupMemberships = await GroupMember.find({ userId: userId })
    .select("groupId")
    .lean();
  const groupIds = userGroupMemberships.map((gm) => gm.groupId);

  return this.countDocuments({
    $or: [
      // For direct messages
      { participant1: userId, conversationType: [Constants.CONVERSATION_TYPES.USER_TO_USER, Constants.CONVERSATION_TYPES.AI_TO_USER] }, { participant2: userId, conversationType: [Constants.CONVERSATION_TYPES.USER_TO_USER, Constants.CONVERSATION_TYPES.AI_TO_USER] },
      // For group messages
      {
        groupId: { $in: groupIds },
        conversationType: Constants.CONVERSATION_TYPES.GROUP,
      },
    ],
    deleted: { $ne: true },
  });
};

// Static method to find AI conversations for a user
conversationSchema.statics.findAIConversations = function (userId) {
  return this.find({
    $or: [{ participant1: userId }, { participant2: userId }],
    conversationType: Constants.CONVERSATION_TYPES.AI_TO_USER,
    deleted: { $ne: true },
  })
    .populate("aiUserId", "name email")
    .populate("lastMessage", "content senderId createdAt messageType")
    .sort({ lastMessageAt: -1, createdAt: -1 });
};

module.exports = mongoose.model("Conversation", conversationSchema);
