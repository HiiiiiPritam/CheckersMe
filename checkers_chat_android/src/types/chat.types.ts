export interface User {
  _id: string;
  name: string;
  email: string;
}

export interface Message {
  _id: string;
  conversationId: string;
  senderId: User;
  content: string;
  messageType: 'text' | 'image';
  imageUrl?: string;
  metadata?: {
    fileUrl?: string;
    fileName?: string;
    fileSize?: number;
    mimeType?: string;
    [key: string]: any;
  };
  replyTo?: Message;
  mentions?: User[];
  createdAt: string;
  readBy: Array<{
    userId: string;
    readAt: string;
  }>;
}

export interface Conversation {
  _id: string;
  conversationType: 'user_to_user' | 'ai_to_user' | 'group';
  participant1?: User;
  participant2?: User;
  name?: string;
  groupId?: {
    _id: string;
    name: string;
  };
  lastMessage?: Message & { messageType?: 'text' | 'image' };
  lastMessageAt?: string;
  unreadCounts: {
    participant1?: number;
    participant2?: number;
    [userId: string]: number;
  } | { [userId: string]: number };
  createdAt: string;
}

export interface ConversationsResponse {
  conversations: Conversation[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
}