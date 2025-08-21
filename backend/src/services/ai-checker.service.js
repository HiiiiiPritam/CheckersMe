const User = require('../models/user.model');
const Conversation = require('../models/conversation.model');
const Message = require('../models/message.model');
const Group = require('../models/group.model');
const GroupMember = require('../models/groupMember.model');
const logger = require('../utils/logger.util');
const wsManager = require('../utils/websocket.util');
const sentryUtil = require('../utils/sentry.util');
const { MESSAGE_TYPES, USER_ROLES } = require('../constants');
const axios = require('axios');

class AICheckerService {
  constructor() {
    this.aiCheckerNumber = process.env.AI_CHECKER_NUMBER || '+971 58 201 5216';
    this.geminiApiKey = process.env.GEMINI_API_KEY;
    this.aiServiceUrl = process.env.AI_CHECKER_SERVICE_URL || 'http://localhost:5000';
    this.patternResponses = this.initializePatternResponses();
  }

  initializePatternResponses() {
    return {
      // Acknowledgment patterns
      'acknowledgment': {
        patterns: [/kar.*rh.*h.*sir/i, /ok.*sir/i, /hnji/i, /theek.*hai/i],
        responses: [
          "Jaldi karo, customer wait kar raha hai.",
          "Time limit hai, fast complete karo.",
          "Good, but jaldi finish karo."
        ]
      },
      
      // Technical issues
      'technical_issue': {
        patterns: [/server.*down/i, /net.*(slow|issue|problem)/i, /system.*(down|hang)/i, /bank.*down/i],
        responses: [
          "Technical issue hai? Alternative method try karo.",
          "System problem hai to manual process use karo.",
          "Server down hai to dusra account try karo."
        ]
      },
      
      // Not received
      'not_received': {
        patterns: [/not.*rec/i, /nhi.*(mila|aya)/i, /receive.*nhi/i],
        responses: [
          "Not received? UTR properly check karo.",
          "Payment nhi mila? Bank se confirm karo.",
          "Abhi tak nhi aya? Details recheck karo."
        ]
      },
      
      // Slip/document issues
      'slip_issue': {
        patterns: [/slip.*(upload.*nhi|nhi.*ho)/i, /date.*time.*show.*nhi/i],
        responses: [
          "Slip upload nhi ho rha? Proper format me bhejo.",
          "Client ko boliye slip properly upload kare.",
          "Date time show nhi ho rha? Retry karo proper slip ke sath."
        ]
      },
      
      // Time-related excuses
      'time_excuse': {
        patterns: [/lunch.*kar.*rah/i, /khana.*kha.*rah/i, /break.*hai/i, /\d+.*minute/i],
        responses: [
          "Lunch break samajh gaya, but jaldi khatam kar ke kaam karo.",
          "Time hai limited, break ke baad immediately start karo.",
          "Customer wait kar raha hai, jaldi complete karo."
        ]
      },
      
      // Completion confirmations
      'completed': {
        patterns: [/ho.*g.*ya/i, /done/i, /complete/i, /approved?/i, /clear.*kar.*diya/i],
        responses: [
          "Excellent! Next transaction ready karo.",
          "Good job! Keep the pace up.",
          "Perfect! Client ko inform kar do."
        ]
      },
      
      // Checking/processing
      'checking': {
        patterns: [/checking.*sir/i, /wait.*checking/i, /dekh.*rah/i],
        responses: [
          "Jaldi check karo, time limit hai.",
          "Fast checking karo aur update do.",
          "Customer wait kar raha hai, quick check karo."
        ]
      },
      
      // Generic/Other category for unmatched messages
      'other': {
        patterns: [], // No patterns - this is the fallback category
        responses: [
          "Samajh gaya, transaction ke liye focus karo.",
          "Theek hai, but customer priority rakhna.",
          "Accha, work pe dhyan do properly.",
          "Transaction status update karte rahna.",
          "Client ke liye best service dena hai."
        ]
      }
    };
  }

  /**
   * Process incoming message and generate AI response if needed
   * @param {Object} message - Message object from webhook
   * @param {string} conversationId - Conversation ID
   */
  async processIncomingMessage(message, conversationId) {
    try {
      // Check if this is a group conversation
      const conversation = await Conversation.findById(conversationId);
      if (!conversation) {
        logger.warn(`Conversation not found: ${conversationId}`);
        return false;
      }
      if(!conversation.groupId) {
        logger.warn(`Conversation is not a group conversation: ${conversationId}`);
        return false;
      }
      console.log('conversation/////////////////', conversation);

      const aiUser = await this.getAIUser();
      if (!aiUser) {
        logger.error('AI user not found');
        return false;
      }

      if (message.senderId.toString() === aiUser._id.toString()) {
        logger.debug('Skipping AI response to own message');
        return false;
      }

      // Check if message is from the checker number (avoid responding to checker)
      const sender = await User.findById(message.senderId);
      if (sender && sender.contactNumber === this.aiCheckerNumber.replace('+', '')) {
        logger.debug('Skipping AI response to checker message');
        return false;
      }
      console.log("//////////////////////Just reached before response check", message);
      
      const aiResponse = await this.generateAIResponse(message.content, conversationId);
      
      if (aiResponse) {
        await this.sendAIResponse(conversationId, aiUser._id, aiResponse);
        return true;
      }

      return false;

    } catch (error) {
      logger.error('Error processing incoming message for AI response:', {
        messageId: message._id,
        conversationId,
        error: error.message
      });
      sentryUtil.captureException(error, {
        context: 'process_incoming_message',
        method: 'processIncomingMessage'
      });
      return false;
    }
  }

  /**
   * Generate AI response using enhanced category detection + Gemini API
   * @param {string} messageContent - Content of the franchise message
   * @param {string} conversationId - Conversation ID for context
   * @returns {string|null} - AI response (never null, always provides response)
   */
  async generateAIResponse(messageContent, conversationId) {
    try {
      console.log('🎯 Generating AI response for:', messageContent);
      
      const categoryContext = await this.getCategoryContext(messageContent, conversationId);
      console.log("📊 Category context:", categoryContext);
      
      if (this.geminiApiKey) {
        try {
          const aiResponse = await this.generateFullAIResponse(messageContent, conversationId, categoryContext);
          if (aiResponse && aiResponse.trim()) {
            console.log('✅ AI response generated successfully');
            return aiResponse;
          }
        } catch (error) {
          console.log('⚠️ AI response generation failed, using fallback:', error.message);
        }
      }

      const patternResponse = this.getPatternResponse(messageContent);
      console.log('📋 Using pattern response as fallback');
      return patternResponse || "Theek hai, transaction pe focus karo properly.";

    } catch (error) {
      console.log('❌ Error in generateAIResponse:', error.message);
      return "Samajh gaya, kaam pe dhyan do.";
    }
  }

  /**
   * Enhanced AI-based category detection with fallback to pattern matching
   * @param {string} messageContent - Message content to analyze
   * @param {string} conversationId - Conversation ID for context
   * @returns {Object} - Category context (never null, uses 'other' as fallback)
   */
  async getCategoryContext(messageContent, conversationId = null) {
    console.log('🔍 Starting enhanced category detection for:', messageContent);
    
    if (this.geminiApiKey && conversationId) {
      try {
        const aiCategory = await this.detectCategoryWithAI(messageContent, conversationId);
        if (aiCategory && this.patternResponses[aiCategory]) {
          console.log('🤖 AI detected category:', aiCategory);
          return {
            category: aiCategory,
            examples: this.patternResponses[aiCategory].responses,
            messageType: aiCategory.replace('_', ' '),
            detectionMethod: 'ai'
          };
        }
      } catch (error) {
        console.log('⚠️ AI category detection failed, falling back to patterns:', error.message);
      }
    }

    const patternCategory = this.getPatternBasedCategory(messageContent);
    console.log('📋 Pattern-based category:', patternCategory);
    
    return {
      category: patternCategory,
      examples: this.patternResponses[patternCategory].responses,
      messageType: patternCategory.replace('_', ' '),
      detectionMethod: 'pattern'
    };
  }

  /**
   * AI-powered category detection
   * @param {string} messageContent - Message content
   * @param {string} conversationId - Conversation ID for context
   * @returns {string|null} - Detected category or null
   */
  async detectCategoryWithAI(messageContent, conversationId) {
    try {
      const recentMessages = await Message.find({ conversationId })
        .sort({ createdAt: -1 })
        .limit(5)
        .populate('senderId', 'name');

      const context = recentMessages
        .reverse()
        .map(msg => `${msg.senderId.name}: ${msg.content}`)
        .join('\\n');

      const categoryDetectionPrompt = `
You are analyzing a WhatsApp message in a financial transaction group to categorize it for appropriate response.

AVAILABLE CATEGORIES:
1. acknowledgment - Confirmations like "kar rhe ha sir", "ok sir", "theek hai"
2. technical_issue - System problems: "server down", "bank issue", "system hang"
3. not_received - Payment not received: "not rec", "nhi mila", "payment pending"
4. slip_issue - Document problems: "slip upload nhi ho rha", "date time show nhi"
5. time_excuse - Time delays: "lunch kar rahe", "break hai", "5 minute"
6. completed - Task done: "ho gya", "done", "approved", "complete"
7. checking - Processing status: "checking sir", "wait", "dekh raha"
8. other - General business messages that don't fit specific categories

RECENT CONTEXT:
${context}

CURRENT MESSAGE: "${messageContent}"

INSTRUCTIONS:
- Analyze the message content and context
- Choose the most appropriate category from the list above
- If the message doesn't clearly fit any specific category but is business-related, use "other"
- Consider the conversation flow and context

Response: Return only the category name (one word) from the list above.
      `;

      const response = await this.callGeminiAPI(categoryDetectionPrompt);
      const detectedCategory = response?.trim().toLowerCase();
      
      console.log('🤖 AI Category Analysis:');
      console.log('   Message:', messageContent);
      console.log('   Detected:', detectedCategory);
      
      if (detectedCategory && this.patternResponses[detectedCategory]) {
        return detectedCategory;
      }
      
      return null;
      
    } catch (error) {
      console.log('❌ AI category detection error:', error.message);
      throw error;
    }
  }

  /**
   * Pattern-based category detection (enhanced fallback)
   * @param {string} messageContent - Message content to analyze
   * @returns {string} - Category (always returns a category, 'other' as fallback)
   */
  getPatternBasedCategory(messageContent) {
    const messageLower = messageContent.toLowerCase();
    
    for (const [category, data] of Object.entries(this.patternResponses)) {
      if (category === 'other') continue;
      
      for (const pattern of data.patterns) {
        if (pattern.test(messageLower)) {
          return category;
        }
      }
    }
    
    return 'other';
  }

  /**
   * Get response using enhanced pattern matching (always returns a response)
   * @param {string} messageContent - Message content to analyze
   * @returns {string} - Pattern-based response (never null)
   */
  getPatternResponse(messageContent) {
    const category = this.getPatternBasedCategory(messageContent);
    const responses = this.patternResponses[category].responses;
    
    return responses[Math.floor(Math.random() * responses.length)];
  }

  /**
   * Enhance pattern response using Gemini AI
   * @param {string} originalMessage - Original franchise message
   * @param {string} baseResponse - Base pattern response
   * @returns {string} - Enhanced response
   */
  async enhanceResponseWithAI(originalMessage, baseResponse) {
    const prompt = `
    Enhance this response to be more natural and contextual:
    Base response: "${baseResponse}"
    Original message: "${originalMessage}"
    
    Make it sound more natural in Hinglish while keeping the same meaning.
    Keep it short (max 15 words):
    `;

    const response = await this.callGeminiAPI(prompt);
    return response?.trim() || baseResponse;
  }

  /**
   * Generate full AI response for complex messages
   * @param {string} messageContent - Message content
   * @param {string} conversationId - Conversation ID for context
   * @param {Object} categoryContext - Category context for better responses
   * @returns {string} - AI generated response
   */
  async generateFullAIResponse(messageContent, conversationId, categoryContext = null) {

    let categoryPrompt = '';
    if (categoryContext) {
      categoryPrompt = `
    Message Category: ${categoryContext.messageType}
    Example responses for this category: ${categoryContext.examples.join(', ')}
    
    Use this category context to generate a natural, contextual response in similar style.
      `;
    }

    const prompt = `
    You are a transaction checker in a financial services WhatsApp group.
    Respond in Hinglish (Hindi + English mix) like: "Accha theek hai bohot badhiya"
    ${categoryPrompt}
    
    Current franchise message: "${messageContent}"
    
    Generate a natural, contextual response based on:
    1. The message category and examples (if provided)
    2. Recent conversation flow
    3. Transaction checking context
    
    Respond in 1-2 short sentences maximum. Be authoritative but helpful.
    Focus on transaction efficiency and customer service.
    Make the response feel natural and context-aware, not random.
    `;

    console.log(prompt);
    

    const response = await this.callGeminiAPI(prompt);
    return response?.trim() || "Transaction ke bare me baat karte hai. Jaldi complete karo.";
  }

  /**
   * Call Gemini API for AI response generation
   * @param {string} prompt - Prompt for AI
   * @returns {string} - AI response
   */
  async callGeminiAPI(prompt) {
    try {
      const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${this.geminiApiKey}`,
        {
          contents: [{
            parts: [{
              text: prompt
            }]
          }]
        },
        {
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: 10000 // 10 second timeout
        }
      );

      return response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    } catch (error) {
      logger.error('Gemini API call failed:', error.message);
      throw error;
    }
  }

  /**
   * Send AI response to group conversation
   * @param {string} conversationId - Conversation ID
   * @param {string} aiUserId - AI user ID
   * @param {string} responseContent - Response content
   */
  async sendAIResponse(conversationId, aiUserId, responseContent) {
    try {
      const message = new Message({
        conversationId: conversationId,
        senderId: aiUserId,
        senderType: 'ai',
        content: responseContent,
        messageType: MESSAGE_TYPES.TEXT,
        metadata: {}
      });

      
      await message.save();

      console.log('AI Response messafe saved/////////:',message );
      

      const conversation = await Conversation.findById(conversationId);
      if (conversation) {
        conversation.lastMessage = message._id;
        conversation.lastMessageAt = new Date();
        await conversation.save();

        const group = await Group.findOne({ conversationId: conversation._id });
        if (group) {
          const groupMembers = await GroupMember.find({ groupId: group._id });
          for (const member of groupMembers) {
            if (member.userId.toString() !== aiUserId.toString()) {
              await conversation.incrementUnreadCount(member.userId);
            }
          }
        }
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
          metadata: message.metadata
        }
      };
      
      wsManager.broadcastToConversation(conversationId.toString(), wsMessage, aiUserId.toString());
      
      logger.info('AI checker response sent successfully', {
        conversationId,
        responseContent: responseContent.substring(0, 50) + '...'
      });

    } catch (error) {
      logger.error('Error sending AI response:', {
        conversationId,
        aiUserId,
        error: error.message
      });
      sentryUtil.captureException(error, {
        context: 'send_ai_response',
        method: 'sendAIResponse'
      });
      throw error;
    }
  }

  /**
   * Get or create AI user (same as notification service)
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
   * Enhanced AI-based relevance check to determine if message needs AI response
   * @param {string} messageContent - Message content
   * @param {string} conversationId - Conversation ID for context
   * @returns {boolean} - Whether to respond
   */
  async shouldRespond(messageContent, conversationId = null) {
    
    // Basic filtering
    if (!messageContent || messageContent.length < 3) {
      return false;
    }

    if (messageContent.includes('<Media omitted>') && messageContent.trim() === '<Media omitted>') {
      return false;
    }

    if (/^\d+$/.test(messageContent.trim())) {
      return false;
    }

    if (messageContent.trim().length <= 2) {
      return false;
    }

    // Check for final/conclusive responses that don't need further interaction
    if (this.isFinalResponse(messageContent)) {
      return false;
    }

    // Enhanced AI-based relevance check
    if (this.geminiApiKey && conversationId) {
      try {
        const isRelevant = await this.checkMessageRelevanceWithAI(messageContent, conversationId);
        return isRelevant;
      } catch (error) {
        return false;
      }
    }

    // Fallback: Pattern-based relevance check
    const hasRelevantPattern = this.hasTransactionRelevantPattern(messageContent);
    return hasRelevantPattern;
  }

  /**
   * AI-powered message relevance detection
   * @param {string} messageContent - Message content
   * @param {string} conversationId - Conversation ID for context
   * @returns {boolean} - Whether message is relevant for AI response
   */
  async checkMessageRelevanceWithAI(messageContent, conversationId) {
    try {
      // Get recent conversation context
      const recentMessages = await Message.find({ conversationId })
        .sort({ createdAt: -1 })
        .limit(8)
        .populate('senderId', 'name email');

      const contextMessages = recentMessages
        .reverse()
        .map(msg => `${msg.senderId.name}: ${msg.content}`)
        .join('\\n');

      const relevancePrompt = `
You are an AI assistant analyzing WhatsApp group messages in a financial transaction processing group. Your job is to determine if a message requires a response from the transaction checker.

CONTEXT: This is a group where:
- Franchise agents report transaction statuses and work updates
- A transaction checker monitors and provides guidance
- People discuss transaction issues, confirmations, problems

RECENT CONVERSATION:
${contextMessages}

CURRENT MESSAGE: "${messageContent}"

DECISION CRITERIA:

Respond with "YES" if the message is:
- Transaction status updates: "kar rhe ha sir", "processing payment", "amount sent"
- Technical problems: "server down", "bank issue", "system hang", "net slow"
- Work status/location updates: "sir abhi bahar hun", "office me nhi hun", "ghar pe hun"
- Asking for help: "sir help chahiye", "kaise karu", "process batao"
- Reporting delays: "lunch kar rahe", "5 minute", "break hai", "busy hun"
- Issues/problems: "not received", "slip upload nhi ho rha", "error aa rha"
- Work acknowledgments: "kar rhe ha sir but...", "doing sir wait"
- Business-related availability: "available sir", "free hun sir", "busy hun sir"

Respond with "NO" if the message is:
- Pure personal chat: "how are you", "what's for lunch", "family kaisi hai"
- Unrelated topics: "cricket match", "weather", "movies", "vacation plans"
- General greetings only: "good morning" (without business context)
- Random casual conversation between users
- Simple final responses: "done sir", "haan sir", "ok sir", "thanks sir"
- Trying to question/order the checker: "tumhara kya hua", "aapka status kya hai"

EXAMPLES:

"sir abhi bahar hun" → YES (work status update, may affect transaction timing)
"kar rhe ha sir" → YES (work acknowledgment)
"server down hai" → YES (technical issue)
"lunch kar rahe 10 minute" → YES (delay notification)
"how are you bro" → NO (personal chat)
"done sir" → NO (final response)
"good morning" → NO (casual greeting)
"sir help chahiye" → YES (work request)

IMPORTANT: Work-related status updates, even about location or availability, need checker attention. Only exclude purely personal conversations or final acknowledgments.

Response: YES or NO (single word only)
      `;

      const response = await this.callGeminiAPI(relevancePrompt);
      const decision = response?.trim().toUpperCase();
      
      console.log('🤖 AI Relevance Analysis:');
      console.log('   Message:', messageContent);
      console.log('   Decision:', decision);
      
      return decision === 'YES';
      
    } catch (error) {
      throw error;
    }
  }

  /**
   * Pattern-based relevance check (fallback method)
   * @param {string} messageContent - Message content
   * @returns {boolean} - Whether message has transaction-relevant patterns
   */
  hasTransactionRelevantPattern(messageContent) {
    const messageLower = messageContent.toLowerCase();
    
    // Transaction-relevant keywords and patterns
    const relevantPatterns = [
      // Status updates
      /\b(kar\s*rhe?|kar\s*rahe?|doing|done|complete|approved?|pending|waiting)\b/i,
      
      // Technical issues
      /\b(server|bank|system|net|network|down|slow|issue|problem|error|hang|stuck)\b/i,
      
      // Transaction terms
      /\b(payment|transaction|transfer|amount|utr|slip|receipt|deposit|withdraw)\b/i,
      
      // Status indicators
      /\b(not\s*rec|receive|mila|nahi|aya|check|verify|confirm|update)\b/i,
      
      // Time/urgency
      /\b(wait|minute|time|urgent|jaldi|fast|quick|delay)\b/i,
      
      // Communication with checker
      /\b(sir|ji|hello.*sir|checking|dekh|batao|help)\b/i
    ];

    return relevantPatterns.some(pattern => pattern.test(messageLower));
  }

  /**
   * Detect final/conclusive responses that don't require further interaction
   * @param {string} messageContent - Message content to analyze
   * @returns {boolean} - Whether this is a final response
   */
  isFinalResponse(messageContent) {
    const messageLower = messageContent.toLowerCase().trim();
    
    console.log('🔍 Checking if final response:', messageLower);
    
    // Final response patterns - messages that conclude a conversation/task
    const finalResponsePatterns = [
      // Simple acknowledgments with "sir"
      /^(haan|han|ha)\s*sir\s*$/i,
      /^theek\s*hai\s*sir\s*$/i,
      /^ok\s*sir\s*$/i,
      /^okay\s*sir\s*$/i,
      /^ji\s*sir\s*$/i,
      /^yes\s*sir\s*$/i,
      
      // Done confirmations
      /^done\s*sir\s*$/i,
      /^ho\s*gya\s*sir\s*$/i,
      /^ho\s*gaya\s*sir\s*$/i,
      /^complete\s*sir\s*$/i,
      /^finished\s*sir\s*$/i,
      
      // Thank you responses
      /^thank\s*you\s*sir\s*$/i,
      /^thanks\s*sir\s*$/i,
      /^dhanyawad\s*sir\s*$/i,
      
      // Understanding confirmations
      /^samajh\s*gaya\s*sir\s*$/i,
      /^samjha\s*sir\s*$/i,
      /^understood\s*sir\s*$/i,
      /^got\s*it\s*sir\s*$/i,
      
      // Simple responses without context
      /^(haan|han|ha|ji|yes|ok|okay|theek|right)$/i,
      /^(done|complete|finished|ho\s*gya|ho\s*gaya)$/i,
      /^(thank\s*you|thanks|dhanyawad)$/i,
      
      // Very short acknowledgments
      /^(hmm|hm|👍|✅|✓)$/i,
      
      // Respectful closures
      /^accha\s*sir\s*$/i,
      /^bilkul\s*sir\s*$/i,
      /^sure\s*sir\s*$/i,
      
      // Confirmation without additional info
      /^(kar\s*diya|kar\s*diya\s*sir|kiya\s*sir)$/i,
      
      // Simple status without elaboration
      /^(clear|cleared|sorted|solved)\s*sir?\s*$/i
    ];
    
    // Check if message matches any final response pattern
    for (const pattern of finalResponsePatterns) {
      if (pattern.test(messageLower)) {
        return true;
      }
    }
    
    // Additional check: Very short messages with only respectful terms
    const respectfulTerms = ['sir', 'ji', 'sahab'];
    const words = messageLower.split(/\s+/);
    
    if (words.length <= 3 && words.some(word => respectfulTerms.includes(word))) {
      const nonRespectfulWords = words.filter(word => !respectfulTerms.includes(word));
      
      // If only simple acknowledgment words remain
      const simpleAcks = ['haan', 'han', 'ha', 'ji', 'yes', 'ok', 'okay', 'theek', 'done', 'complete'];
      if (nonRespectfulWords.length <= 1 && 
          nonRespectfulWords.every(word => simpleAcks.includes(word))) {
        return true;
      }
    }
    
    return false;
  }
}

module.exports = new AICheckerService();