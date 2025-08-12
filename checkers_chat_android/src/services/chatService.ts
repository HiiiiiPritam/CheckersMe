import apiClient from './apiClient';
import { ConversationsResponse } from '../types/chat.types';

export const chatService = {
  getConversations: async (page = 1, limit = 20): Promise<ConversationsResponse> => {
    const response = await apiClient.get(`/api/conversations?page=${page}&limit=${limit}`);
    return response.data.data;
  },

  getConversationMessages: async (conversationId: string, page = 1, limit = 50) => {
    const response = await apiClient.get(`/api/conversations/${conversationId}/messages?page=${page}&limit=${limit}`);
    return response.data.data;
  },

  sendMessage: async (conversationId: string, content: string, messageType: 'text' | 'image' = 'text', replyTo?: string, mentions?: string[]) => {
    const payload: any = { content, messageType };
    if (replyTo) {
      payload.replyTo = replyTo;
    }
    if (mentions && mentions.length > 0) {
      payload.mentions = mentions;
    }
    const response = await apiClient.post(`/api/conversations/${conversationId}/messages`, payload);
    return response.data.data;
  },

  sendImageMessage: async (conversationId: string, imageUri: string, content?: string, replyTo?: string, mentions?: string[]) => {
    try {
      const response = await fetch(imageUri);
      const blob = await response.blob();
      
      const formData = new FormData();
      formData.append('base64Image', blob, 'image.jpg');
      formData.append('messageType', 'image');
      if (content) formData.append('content', content);
      if (replyTo) formData.append('replyTo', replyTo);
      if (mentions && mentions.length > 0) formData.append('mentions', JSON.stringify(mentions));
      
      const apiResponse = await apiClient.post(`/api/conversations/${conversationId}/messages`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      return apiResponse.data.data;
    } catch (error) {
      throw new Error('Failed to process image');
    }
  },

  createConversation: async (participantId: string) => {
    const response = await apiClient.post('/api/conversations', { participantId });
    return response.data.data;
  }
};