const User = require('../models/user.model');
const Conversation = require('../models/conversation.model');
const Message = require('../models/message.model');
const logger = require('../utils/logger.util');
const wsManager = require('../utils/websocket.util');
const sentryUtil = require('../utils/sentry.util');
const Group = require('../models/group.model');
const GroupMember = require('../models/groupMember.model');
const { CONVERSATION_TYPES, MESSAGE_TYPES, USER_ROLES } = require('../constants');


class NotificationService {
  /**
   * Send notification to user based on transaction time difference
   * @param {string} franchiseName - Franchise name to find the user
   * @param {number} timeDifferenceMinutes - Time difference in minutes
   * @param {Object} transactionDetails - Transaction details
   */
  async sendTransactionNotification(franchiseName, timeDifferenceMinutes, transactionDetails) {
    try {

      if((transactionDetails.amount<0 && timeDifferenceMinutes<20) || (transactionDetails.amount>=0 && timeDifferenceMinutes<2))return false;

      const franchiseUser  = await User.findOne({ name: franchiseName });
      if (!franchiseUser) {
        logger.warn(`User not found with franchise: ${franchiseName}`);
        return false;
      }

      //Find all groups associated with this franchise user ID
      const relevantGroups = await Group.find({ franchiseIds: { $in: [franchiseUser._id] } });

      // Build and send message based on time difference
      // the ai user notification will be sent regrdless of the fact theat theyhave joined groups or not
      await this.buildNotificationAndSendMessage(timeDifferenceMinutes, transactionDetails, franchiseUser._id);
      
      if(relevantGroups.length == 0)return true;

      let groupMessageContent = '';
      if (transactionDetails.amount >= 0) { // Deposits
                groupMessageContent = `A deposit for franchise ${franchiseName} (Order ID: ${transactionDetails.orderId}, Amount: ₹${Math.abs(transactionDetails.amount)}) is pending for ${this.timeDifferenceToMinutesMessage(timeDifferenceMinutes)} minutes.`;
      } else { // Withdraws
                groupMessageContent = `A withdrawal for franchise ${franchiseName} (Order ID: ${transactionDetails.orderId}, Amount: ₹${Math.abs(transactionDetails.amount)}) is pending for ${this.timeDifferenceToMinutesMessage(timeDifferenceMinutes)} minutes.`;
      }      
      const aiUser = await this.getAIUser();
      if (!aiUser) {
        throw new Error('AI System User not found or created.');
      }
      // Iterate through each group and send message
      for (const group of relevantGroups) {
          const conversation = await Conversation.findById(group.conversationId);
          if (!conversation) {
            logger.warn(`Conversation not found for group ${group._id}. Skipping notification for this group.`);
            continue;
          }

          await this.sendMessageToGroup(
            conversation._id,
            aiUser._id,
            groupMessageContent,
          );
      }

      return true;

    } catch (error) {
      logger.error('Error sending transaction notification:', {
        franchiseName,
        timeDifferenceMinutes,
        orderId: transactionDetails?.orderId,
        error: error.message
      });
      sentryUtil.captureException(error, {
                context: 'send_transaction_notification',
                method: 'sendTransactionNotification'
            });
      return false;
    }
  }

  timeDifferenceToMinutesMessage(timeDifference){
    if(timeDifference<2)return;
    else if(timeDifference>=2 && timeDifference<5)return `2-5`;
    else if(timeDifference>=5 && timeDifference<8)return `5-8`;
    else if(timeDifference>=8 && timeDifference<12)return `8-12`;
    else if(timeDifference>=12 && timeDifference<20)return `12-20`;
    else if(timeDifference>=20 && timeDifference<30)return `20-30`;
    else if(timeDifference>=30 && timeDifference<45)return `30-45`;
    else if(timeDifference>=45 && timeDifference<60)return `45-60`;
    else return `more than 60`;
  }
  /**
   * Send message to a group conversation.
   * @param {string} conversationId - The ID of the group conversation.
   * @param {string} senderId - The ID of the sender (e.g., AI user).
   * @param {string} messageContent - The content of the message.
   * @param {Object} options - Options object including session and metadata.
   * @param {Object} options.metadata - Additional metadata for the message.
   */
  async sendMessageToGroup(conversationId, senderId, messageContent) {
    try {
      const message = new Message({
        conversationId: conversationId,
        senderId: senderId,
        senderType: 'ai',
        content: messageContent,
        messageType: MESSAGE_TYPES.TEXT,
      });
      await message.save();

      const conversation = await Conversation.findById(conversationId);
      if (!conversation) {
        throw new Error(`Conversation ${conversationId} not found for group message.`);
      }

      conversation.lastMessage = message._id;
      conversation.lastMessageAt = new Date();
      await conversation.save();

      // Increment unread counts for all members of the group
      // This assumes `conversation.groupRef` links Conversation to Group
      const group = await Group.findOne({ conversationId: conversation._id });
      if (!group) {
        throw new Error(`Group not found for conversation ${conversationId}.`);
      }
      const groupMembers = await GroupMember.find({ groupId: group._id });
      if (groupMembers && groupMembers.length > 0) {
        for (const member of groupMembers) {
          await conversation.incrementUnreadCount(member.userId);
        }
      } else {
        logger.warn(`No group members found for conversation ${conversationId}. Unread counts not incremented.`);
      }

      await message.populate('senderId', 'name email');
      const wsMessage = {
        type: 'new_message',
        message: {
          _id: message._id,
          conversationId: message.conversationId,
          senderId: message.senderId.toObject({ virtuals: true }),
          content: message.content,
          messageType: message.messageType,
          createdAt: message.createdAt,
          updatedAt: message.updatedAt,
        }
      };
      wsManager.broadcastToConversation(conversationId.toString(), wsMessage, senderId.toString());

    } catch (error) {
      console.error(`🔔 Error sending message to group conversation ${conversationId}:`, error);
      logger.error(`Error sending message to group conversation ${conversationId}:`, {
        conversationId,
        senderId,
        error: error.message
      });
      sentryUtil.captureException(error, {
        context: 'send_message_to_group',
        method: 'sendMessageToGroup'
      });
      throw error;
    }
  }

  /**
   * Build notification message based on time difference
   * @param {number} timeDifferenceMinutes - Time difference in minutes
   * @param {Object} transactionDetails - Transaction details
   * @returns {string} - Formatted message
   */
  async buildNotificationAndSendMessage(timeDifferenceMinutes, transactionDetails, userId) {
    // timeDifferenceMinutes -= 330; // TODO - comment this line for production
    if (transactionDetails.amount >= 0) { // Deposits
      await this.getDepositTransactionMessage(timeDifferenceMinutes, transactionDetails, userId)
    } else { // Withdraws
      await this.getWithdrawTransactionMessage(timeDifferenceMinutes, transactionDetails, userId)
    }
  }

  async getDepositTransactionMessage(timeDifferenceMinutes, transactionDetails, userId) {
    let { orderId, amount } = transactionDetails
    let message = ''

    if (timeDifferenceMinutes <= 2) {
      return;
    } else if (timeDifferenceMinutes <= 5) {
      message = `Your deposit transaction is pending from last 2-5 minutes\nOrder Id - ${orderId}\nAmount - ₹${Math.abs(amount)}`;
    } else if (timeDifferenceMinutes <= 8) {
      message = `Your deposit transaction is pending from last 5-8 minutes\nOrder Id - ${orderId}\nAmount - ₹${Math.abs(amount)}`;
    } else if (timeDifferenceMinutes <= 12) {
      message = `Your deposit transaction is pending from last 8-12 minutes\nOrder Id - ${orderId}\nAmount - ₹${Math.abs(amount)}`;
    } else if (timeDifferenceMinutes <= 20) {
      message = `Your deposit transaction is pending from last 12-20 minutes\nOrder Id - ${orderId}\nAmount - ₹${Math.abs(amount)}`;
    } else {
      message = `Your deposit transaction is pending for more than 20 minutes\nOrder Id - ${orderId}\nAmount - ₹${Math.abs(amount)}`;
    }

    // Send message to user
    await this.sendMessageToUser(userId, message);
  }

  async getWithdrawTransactionMessage(timeDifferenceMinutes, transactionDetails, userId) {
    let { orderId, amount } = transactionDetails
    let message = ''

    if (timeDifferenceMinutes <= 20) {
      return;
    } else if (timeDifferenceMinutes <= 30) {
      message = `Your withdraw transaction is pending from last 20-30 minutes\nOrder Id - ${orderId}\nAmount - ₹${Math.abs(amount)}`;
    } else if (timeDifferenceMinutes <= 45) {
      message = `Your withdraw transaction is pending from last 30-45 minutes\n$Order Id - ${orderId}\nAmount - ₹${Math.abs(amount)}`;
    } else if (timeDifferenceMinutes <= 60) {
      message = `Your withdraw transaction is pending from last 45-60 minutes\nOrder Id - ${orderId}\nAmount - ₹${Math.abs(amount)}`;
    } else {
      message = `Your withdraw transaction is pending for more than 60 minutes\nOrder Id - ${orderId}\nAmount - ₹${Math.abs(amount)}`;
    }

    // Send message to user
    await this.sendMessageToUser(userId, message);
    // await this.sendMessageToAdmin(message, transactionDetails.franchiseName)
  }

  /**
   * Send message to user using conversation system
   * @param {string} userId - User ID to send message to
   * @param {string} messageContent - Message content
   */
  async sendMessageToUser(userId, messageContent) {
    try {
      const aiUser = await this.getAIUser();
      const conversation = await this.findOrCreateConversation(aiUser._id, userId);
      
      // Create and save message
      const message = new Message({
        conversationId: conversation._id,
        senderId: aiUser._id,
        senderType: 'ai',
        content: messageContent,
        messageType: MESSAGE_TYPES.TEXT,
        metadata: {
          aiServiceId: 'transaction-notification-ai'
        }
      });
      
      await message.save();
      
      // Populate sender info for WebSocket broadcast
      await message.populate('senderId', 'name email');
      
      // Update conversation with last message
      conversation.lastMessage = message._id;
      conversation.lastMessageAt = new Date();
      await conversation.save();
      await conversation.incrementUnreadCount(userId);
      
      // Broadcast message via WebSocket
      const wsMessage = {
        type: 'new_message',
        message: {
          _id: message._id,
          conversationId: message.conversationId,
          senderId: message.senderId,
          content: message.content,
          messageType: message.messageType,
          createdAt: message.createdAt,
          updatedAt: message.updatedAt
        }
      };
      
      wsManager.broadcastToConversation(conversation._id.toString(), wsMessage, aiUser._id.toString());     
    } catch (error) {
      console.error('🔔 Error sending message to user:', error);
      logger.error('Error sending message to user:', {
        userId,
        error: error.message
      });
      sentryUtil.captureException(error, {
        context: 'send_message_to_user',
        method: 'sendMessageToUser'
      });
      throw error;
    }
  }

  /**
   * Get or create system user for notifications
   * @returns {Object} - AI user object
   */
  async getAIUser() {
    let aiUser = await User.findOne({ email: 'checkerschatai@agent.com' });
    
    if (!aiUser) {
      aiUser = new User({
        name: 'Checkers Chat AI',
        email: 'checkerschatai@agent.com',
        password: 'checkerschatai@agent.com',
        contactNumber: "0000000000",
        role: USER_ROLES.AI,
      });
      await aiUser.save();
    }
    
    return aiUser;
  }

    /**
   * Get or create system user for notifications
   * @returns {Object} - Admin user object
   */
    async getAdminUser() {
      let adminUser = await User.findOne({ email: process.env.CHAT_ADMIN_EMAIL });
      return adminUser;
    }

  async sendMessageToAdmin(messageContent, franchiseName) {
    try {
      const adminUser = await this.getAdminUser();
      const aiUser = await this.getAIUser();
      const conversation = await this.findOrCreateConversation(adminUser._id, aiUser._id);

      // Create and save message
      const message = new Message({
        conversationId: conversation._id,
        senderId: aiUser._id,
        senderType: 'ai',
        content: `${messageContent}\nFranchise - ${franchiseName}`,
        messageType: MESSAGE_TYPES.TEXT,
        metadata: {
          aiServiceId: 'transaction-notification-admin'
        }
      });
      await message.save();

      // Update conversation with last message
      conversation.lastMessage = message._id;
      conversation.lastMessageAt = new Date();
      await conversation.save();
      await conversation.incrementUnreadCount(adminUser._id);
      
      // Broadcast message via WebSocket
      const wsMessage = {
        type: 'new_message',
        message: {
          _id: message._id,
          conversationId: message.conversationId,
          senderId: message.senderId,
          content: message.content,
          messageType: message.messageType,
          createdAt: message.createdAt,
          updatedAt: message.updatedAt
        }
      };
      wsManager.broadcastToConversation(conversation._id.toString(), wsMessage, aiUser._id.toString());
    } catch (error) {
      logger.error('Error sending message to Admin:', {
        error: error.message
      });
      sentryUtil.captureException(error, {
        context: 'send_message_to_admin',
        method: 'sendMessageToAdmin'
      });
      throw error;
    }
  }

  /**
   * Find or create conversation between two users
   * @param {string} aiUserId - System user ID
   * @param {string} userId - Target user ID
   * @returns {Object} - Conversation object
   */
  async findOrCreateConversation(aiUserId, userId) {
    let conversation = await Conversation.findConversationBetweenUsers(aiUserId, userId);
    
    if (!conversation) {
      conversation = new Conversation({
        participant1: aiUserId,
        participant2: userId,
        conversationType: CONVERSATION_TYPES.AI_TO_USER,
        aiUserId: aiUserId
      });
      await conversation.save();
    }
    
    return conversation;
  }
}

module.exports = new NotificationService();