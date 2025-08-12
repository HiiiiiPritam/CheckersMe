import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import conversationService from '../../services/conversationService';

export const fetchConversations = createAsyncThunk(
  'conversations/fetchConversations',
  async ({ page = 1, limit = 20 }, { rejectWithValue }) => {
    try {
      const response = await conversationService.getConversations(page, limit);
      return response.data;
    } catch (error) {
      console.error('Error fetching conversations:', error);
      return rejectWithValue(error.response?.data?.message || error.message);
    }
  }
);

export const fetchConversationMessages = createAsyncThunk(
  'conversations/fetchMessages',
  async ({ conversationId, page = 1, limit = 50 }, { rejectWithValue }) => {
    try {
      const response = await conversationService.getConversationMessages(conversationId, page, limit);
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || error.message);
    }
  }
);

export const sendMessage = createAsyncThunk(
  'conversations/sendMessage',
  async ({ conversationId, messageData }, { rejectWithValue }) => {
    try {
      const response = await conversationService.sendMessage(conversationId, messageData);
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || error.message);
    }
  }
);

export const createConversation = createAsyncThunk(
  'conversations/createConversation',
  async (participantId, { rejectWithValue }) => {
    try {
      const response = await conversationService.createConversation(participantId);
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || error.message);
    }
  }
);

export const markMessagesAsRead = createAsyncThunk(
  'conversations/markAsRead',
  async (conversationId, { rejectWithValue }) => {
    try {
      await conversationService.markMessagesAsRead(conversationId);
      return conversationId;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || error.message);
    }
  }
);

const conversationSlice = createSlice({
  name: 'conversations',
  initialState: {
    conversations: [],
    currentConversation: null,
    messages: [],
    loading: false,
    messagesLoading: false,
    sendingMessage: false,
    error: null,
    totalPages: 0,
    currentPage: 1,
    unreadCount: 0
  },
  reducers: {
    setCurrentConversation: (state, action) => {
      state.currentConversation = action.payload;
      state.messages = [];
    },
    clearError: (state) => {
      state.error = null;
    },
    addMessage: (state, action) => {
      state.messages.push(action.payload);
    },
    updateMessage: (state, action) => {
      const index = state.messages.findIndex(msg => msg._id === action.payload._id);
      if (index !== -1) {
        state.messages[index] = action.payload;
      }
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchConversations.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchConversations.fulfilled, (state, action) => {
        state.loading = false;
        state.conversations = action.payload.conversations || [];
        state.totalPages = action.payload.pagination?.totalPages || 0;
        state.currentPage = action.payload.pagination?.page || 1;
      })
      .addCase(fetchConversations.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload || action.error.message;
        console.error('fetchConversations rejected:', action.payload || action.error.message);
      })
      .addCase(fetchConversationMessages.pending, (state) => {
        state.messagesLoading = true;
      })
      .addCase(fetchConversationMessages.fulfilled, (state, action) => {
        state.messagesLoading = false;
        state.messages = action.payload.messages || [];
      })
      .addCase(fetchConversationMessages.rejected, (state, action) => {
        state.messagesLoading = false;
        state.error = action.error.message;
      })
      .addCase(sendMessage.pending, (state) => {
        state.sendingMessage = true;
        state.error = null;
      })
      .addCase(sendMessage.fulfilled, (state, action) => {
        state.sendingMessage = false;
        state.messages.push(action.payload);
      })
      .addCase(sendMessage.rejected, (state, action) => {
        state.sendingMessage = false;
        state.error = action.payload || action.error.message;
      })
      .addCase(createConversation.fulfilled, (state, action) => {
        state.conversations.unshift(action.payload);
      })
      .addCase(markMessagesAsRead.fulfilled, (state, action) => {
        // Update unread count for the conversation
        const conversationId = action.payload;
        const conversation = state.conversations.find(conv => conv._id === conversationId);
        if (conversation) {
          conversation.unreadCount = 0;
        }
      });
  }
});

export const { setCurrentConversation, clearError, addMessage, updateMessage } = conversationSlice.actions;
export default conversationSlice.reducer;