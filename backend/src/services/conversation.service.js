const Conversation = require('../models/conversation.model');
const Message = require('../models/message.model');
const Constants = require('../constants/index.js');
const Group = require('../models/group.model');
const GroupMember = require('../models/groupMember.model');
const mongoose = require('mongoose');
const webSocketManager = require('../utils/websocket.util');

class ConversationService {
  /**
   * Create a new conversation between two users
   * @param {string} userId1 - First user ID
   * @param {string} userId2 - Second user ID
   * @returns {Object} - Created conversation
   */
  async createConversation(userId1, userId2) {
    try {
      const existingConversation = await Conversation.findConversationBetweenUsers(userId1, userId2);
      
      if (existingConversation) {
        return existingConversation;
      }

      const conversation = new Conversation({
        participant1: userId1,
        participant2: userId2,
        conversationType: Constants.CONVERSATION_TYPES.USER_TO_USER
      });

      await conversation.save();
      return conversation;
    } catch (error) {
      throw new Error(`Failed to create conversation: ${error.message}`);
    }
  }

  /**
   * Get all conversations for a user
   * @param {string} userId - User ID
   * @param {Object} options - Pagination options
   * @returns {Object} - Conversations and pagination info
   */
  async getUserConversations(userId, options = {}) {
    try {
      const { page = 1, limit = 20 } = options;
      const skip = (page - 1) * limit;
      
      const conversations = await Conversation.findUserConversations(userId, { page, limit });
      const totalConversations = await Conversation.countUserConversations(userId);
      
      return {
        conversations,
        pagination: {
          page,
          limit,
          total: totalConversations,
          totalPages: Math.ceil(totalConversations / limit),
          hasMore: page * limit < totalConversations
        }
      };
    } catch (error) {
      throw new Error(`Failed to get user conversations: ${error.message}`);
    }
  }

  /**
   * Get a specific conversation by ID
   * @param {string} conversationId - Conversation ID
   * @param {string} userId - User ID (for authorization)
   * @returns {Object} - Conversation details
   */
  async getConversation(conversationId, userId) {
    try {
      const conversation = await Conversation.findById(conversationId)
        .populate('participant1', 'name email')
        .populate('participant2', 'name email')
        .populate('groupId', 'name groupPicture')
        .populate('lastMessage', 'content senderId createdAt');

      if (!conversation || conversation.deleted) {
        throw new Error('Conversation not found');
      }

      const isParticipant = await conversation.isParticipant(userId);
      if (!isParticipant) {
        throw new Error('Access denied. You are not a participant in this conversation.');
      }

      // For group conversations, also return members list
      if (conversation.conversationType === Constants.CONVERSATION_TYPES.GROUP) {
        const members = await GroupMember.find({ groupId: conversation.groupId }).populate('userId', 'name email')
                                         .lean();
        return { ...conversation.toObject(), members };
      }
      return conversation;
    } catch (error) {
      throw new Error(error.message);
    }
  }

  /**
   * Delete a conversation (soft delete)
   * @param {string} conversationId - Conversation ID
   * @param {string} userId - User ID (for authorization)
   * @returns {Object} - Deleted conversation
   */
  async deleteConversation(conversationId, userId) {
    try {
      const conversation = await Conversation.findById(conversationId);

      if (!conversation) {
        throw new Error('Conversation not found');
      }

      // Check if user is participant in this conversation
      const isParticipant = await conversation.isParticipant(userId);
      if (!isParticipant) {
        throw new Error('Access denied. You are not a participant in this conversation.');
      }
      // This logic should ideally be handled by the groupService.deleteGroup
      if (conversation.conversationType === Constants.CONVERSATION_TYPES.GROUP) {
        throw new Error('Group conversations must be deleted via group management API.');
      }
      await conversation.delete(userId);
      return conversation;
    } catch (error) {
      throw new Error(`Failed to delete conversation: ${error.message}`);
    }
  }

  /**
   * Get messages in a conversation
   * @param {string} conversationId - Conversation ID
   * @param {string} userId - User ID (for authorization)
   * @param {Object} options - Query options (page, limit, beforeId)
   * @returns {Object} - Messages and pagination info
   */
  async getConversationMessages(conversationId, userId, options = {}) {
    try {
      const conversation = await Conversation.findById(conversationId);
      if (!conversation || conversation.deleted) {
        throw new Error('Conversation not found');
      }

      const isParticipant = await conversation.isParticipant(userId);
      if (!isParticipant) {
        throw new Error('Access denied. You are not a participant in this conversation.');
      }

      const { page = 1, limit = 50, beforeId = null } = options;
      const messages = await Message.findConversationMessages(conversationId, {
        page,
        limit,
        beforeId
      });

      // Only mark as read for the first page (when user enters chat)
      if (page === 1) {
        await Message.markConversationAsRead(conversationId, userId);
        await conversation.resetUnreadCount(userId);
      }

      // For group conversations, also update the lastSeenMessageId for the user in GroupMember
      if (conversation.conversationType === Constants.CONVERSATION_TYPES.GROUP && messages.length > 0) {
        const latestMessage = messages[0];
        await GroupMember.findOneAndUpdate(
          { groupId: conversation.groupId, userId: userId },
          { lastSeenMessageId: latestMessage._id },
          { new: true }
        );
      }
      
      return {
        messages: messages.reverse(),
        pagination: {
          page,
          limit,
          hasMore: messages.length === limit
        }
      };
    } catch (error) {
      throw new Error(error.message);
    }
  }

     /**
   * Send a message in a conversation
   * @param {string} conversationId - Conversation ID
   * @param {string} senderId - Sender user ID
   * @param {string} content - Message content (can be null for image messages)
   * @param {Object} options - Additional message options
   * @param {string[]} [options.mentions] - Array of user IDs to tag
   * @param {string} [options.base64Image] - Base64 string of the image
   * @param {string} [options.messageType] - Type of message (TEXT, IMAGE, etc.)
   * @param {Object} [options.metadata] - Additional metadata for the message
   * @param {string} [options.replyTo] - ID of the message being replied to
   * @returns {Object} - Created message
   */
  async sendMessage(conversationId, senderId, content, options = {}) {
    try {      
      const conversation = await Conversation.findById(conversationId);
      if (!conversation || conversation.deleted) {
        throw new Error('Conversation not found.');
      }

      const isParticipant = await conversation.isParticipant(senderId);
      if (!isParticipant) {
        throw new Error('Access denied. You are not a participant in this conversation.');
      }

      let messageType = options.messageType || Constants.MESSAGE_TYPES.TEXT;
      let metadata = options.metadata || {};
      let actualContent = content; // Keep content as is for text messages

      if (options.base64Image) {
        const imageUrl = options.base64Image; // Store base64 directly for now
        if (!imageUrl) {
          throw new Error('Failed to save image. Please try again.');
        }
        messageType = Constants.MESSAGE_TYPES.IMAGE;
        metadata = {
          ...metadata,
          fileUrl: imageUrl,
          mimeType: 'image/jpeg',
        };
        actualContent = content || '[Image]';
      }

      if (messageType === Constants.MESSAGE_TYPES.TEXT && (!actualContent || actualContent.trim().length === 0)) {
        throw new Error('Message content is required for text messages.');
      }

      const message = new Message({
        conversationId,
        senderId,
        content: actualContent,
        messageType: messageType,
        metadata: metadata,
        replyTo: options.replyTo || null,
        mentions: options.mentions || []
      });

      await message.save();

      conversation.lastMessage = message._id;
      conversation.lastMessageAt = message.createdAt;

      // Increment unread counts for other participants
      let participantsToNotify = [];
      if (conversation.conversationType === Constants.CONVERSATION_TYPES.USER_TO_USER) {
        const otherParticipant = conversation.getOtherParticipant(senderId);
        await conversation.incrementUnreadCount(otherParticipant);
        participantsToNotify = [otherParticipant.toString()];
      } else if (conversation.conversationType === Constants.CONVERSATION_TYPES.GROUP) {
        const groupMembers = await GroupMember.find({ groupId: conversation.groupId }).select('userId')
        for (const member of groupMembers) {
          if (member.userId.toString() !== senderId.toString()) { 
            await conversation.incrementUnreadCount(member.userId);
            participantsToNotify.push(member.userId.toString());
          }
        }
      }
      await conversation.save();

      await message.populate('senderId', 'name email');
      await message.populate({
        path: 'replyTo',
        select: 'content senderId messageType metadata',
        populate: {
          path: 'senderId',
          select: 'name email'
        }
      });
      await message.populate('mentions', 'name email');

      webSocketManager.broadcastToConversation(conversationId, {
        type: 'new_message',
        message: message.toObject(),
      }, senderId);
      return message;
    } catch (error) {
      throw new Error(`Failed to send message: ${error.message}`);
    }
  }

  /**
   * Mark messages as read
   * @param {string} conversationId - Conversation ID
   * @param {string} userId - User ID
   * @returns {Object} - Updated conversation
   */
  async markMessagesAsRead(conversationId, userId) {
    try {
      const conversation = await Conversation.findById(conversationId);
      if (!conversation || conversation.deleted) {
        throw new Error('Conversation not found.');
      }

      const isParticipant = await conversation.isParticipant(userId);
      if (!isParticipant) {
        throw new Error('Access denied. You are not a participant in this conversation.');
      }

      await Message.markConversationAsRead(conversationId, userId);
      await conversation.resetUnreadCount(userId);

      // For group conversations, update lastSeenMessageId in GroupMember
      if (conversation.conversationType === Constants.CONVERSATION_TYPES.GROUP) {
        const latestMessage = await Message.findOne({ conversationId }).sort({ createdAt: -1 })
        if (latestMessage) {
          await GroupMember.findOneAndUpdate(
            { groupId: conversation.groupId, userId: userId },
            { lastSeenMessageId: latestMessage._id },
            { new: true }
          );
        }
      }
      
      return conversation;
    } catch (error) {
      throw new Error(`Failed to mark messages as read: ${error.message}`);
    }
  }

  /**
   * Get total unread message count for a user
   * @param {string} userId - User ID
   * @returns {number} - Total unread count
   */
  async getUnreadMessageCount(userId) {
    try {
      const conversations = await Conversation.findUserConversations(userId);
      const totalUnreadCount = conversations.reduce((total, conversation) => {
        return total + conversation.getUnreadCount(userId);
      }, 0);
      return totalUnreadCount;
    } catch (error) {
      throw new Error(`Failed to get unread message count: ${error.message}`);
    }
  }

  /**
   * Search conversations for a user - Searches for user name or email in the conversation
   * @param {string} userId - User ID
   * @param {string} searchTerm - Search term
   * @returns {Array} - Filtered conversations
   */
  async searchConversations(userId, searchTerm) {
    try {
      const conversations = await Conversation.findUserConversations(userId);
      const searchLower = searchTerm.toLowerCase();
      
      const filteredConversations = conversations.filter(conversation => {
        if (conversation.conversationType === Constants.CONVERSATION_TYPES.USER_TO_USER) {
          const p1Name = `${conversation.participant1.name}`.toLowerCase();
          const p2Name = `${conversation.participant2.name}`.toLowerCase();

          return p1Name.includes(searchLower) ||
            p2Name.includes(searchLower)
        } else if (conversation.conversationType === Constants.CONVERSATION_TYPES.GROUP) {
          const groupName = conversation.groupId ? conversation.groupId.name.toLowerCase() : '';
          return groupName.includes(searchLower);
        }
        return false;
      });
      return filteredConversations;
    } catch (error) {
      throw new Error(`Failed to search conversations: ${error.message}`);
    }
  }
}

module.exports = new ConversationService(); 