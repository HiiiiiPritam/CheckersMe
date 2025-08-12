import api from './api';

export const conversationService = {
  // Get all conversations
  getConversations: async (page = 1, limit = 20) => {
    const response = await api.get(`/api/conversations?page=${page}&limit=${limit}`);
    return response.data;
  },

  // Get specific conversation
  getConversation: async (conversationId) => {
    const response = await api.get(`/api/conversations/${conversationId}`);
    return response.data;
  },

  // Get conversation messages
  getConversationMessages: async (conversationId, page = 1, limit = 50) => {
    const response = await api.get(`/api/conversations/${conversationId}/messages?page=${page}&limit=${limit}`);
    return response.data;
  },

  // Send message with mentions support
  sendMessage: async (conversationId, messageData) => {
    const formData = new FormData();
    
    // Add text content
    if (messageData.content) {
      formData.append('content', messageData.content);
    }
    
    // Add message type
    if (messageData.messageType) {
      formData.append('messageType', messageData.messageType);
    }
    
    // Add mentions
    if (messageData.mentions && messageData.mentions.length > 0) {
      formData.append('mentions', JSON.stringify(messageData.mentions));
    }
    
    // Add reply to
    if (messageData.replyTo) {
      formData.append('replyTo', messageData.replyTo);
    }
    
    // Add metadata
    if (messageData.metadata) {
      formData.append('metadata', JSON.stringify(messageData.metadata));
    }
    
    // Add image file
    if (messageData.image) {
      formData.append('base64Image', messageData.image);
    }

    const response = await api.post(`/api/conversations/${conversationId}/messages`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  // Create new conversation
  createConversation: async (participantId) => {
    const response = await api.post('/api/conversations', { participantId });
    return response.data;
  },

  // Mark messages as read
  markMessagesAsRead: async (conversationId) => {
    const response = await api.put(`/api/conversations/${conversationId}/messages/read`);
    return response.data;
  },

  // Search conversations
  searchConversations: async (searchTerm) => {
    const response = await api.get(`/api/conversations/search?searchTerm=${encodeURIComponent(searchTerm)}`);
    return response.data;
  },

  // Get unread count
  getUnreadCount: async () => {
    const response = await api.get('/api/conversations/unread-count');
    return response.data;
  },

  // Delete conversation
  deleteConversation: async (conversationId) => {
    const response = await api.delete(`/api/conversations/${conversationId}`);
    return response.data;
  }
};

export default conversationService;