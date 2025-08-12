import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useDispatch, useSelector } from 'react-redux';
import { colors, typography, spacing } from '../../theme';
import { RootState, AppDispatch } from '../../store';
import { fetchConversations, setCurrentConversation } from '../../store/slices/chatSlice';
import { Conversation } from '../../types/chat.types';
import { CreateGroupModal } from '../../components/common/CreateGroupModal';
import { USER_ROLES, CONVERSATION_TYPES } from '../../../constants'

interface ChatsScreenProps {
  onNavigateToChat?: (conversationId: string, participantName: string, groupId?: string) => void;
}

export const ChatsScreen: React.FC<ChatsScreenProps> = ({ onNavigateToChat }) => {
  const dispatch = useDispatch<AppDispatch>();
  const { conversations, loading, error } = useSelector((state: RootState) => state.chat);
  const { user } = useSelector((state: RootState) => state.auth);
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);

  const canCreateGroup = user?.role === USER_ROLES.ADMIN || user?.role === USER_ROLES.CHECKER;

  useEffect(() => {
    dispatch(fetchConversations({ page: 1, limit: 20 }));
  }, [dispatch]);

  const getConversationInfo = (conversation: Conversation) => {
    if (conversation.conversationType === CONVERSATION_TYPES.GROUP) {
      // Handle group unread count
      let unreadCount = 0;
      if (conversation.unreadCounts && user) {
        if (typeof conversation.unreadCounts === 'object' && conversation.unreadCounts[user._id]) {
          unreadCount = conversation.unreadCounts[user._id] || 0;
        }
      }
      
      return {
        name: conversation?.groupId?.name || 'Group Chat',
        avatar: conversation?.groupId?.name?.charAt(0).toUpperCase() || 'G',
        unreadCount
      };
    }
    
    if (!user || !conversation.participant1 || !conversation.participant2) {
      return { name: 'Unknown', avatar: 'U', unreadCount: 0 };
    }
    
    const otherParticipant = conversation.participant1._id === user._id 
      ? conversation.participant2 
      : conversation.participant1;
    
    // Handle both old and new unread count structures
    let unreadCount = 0;
    if (conversation.unreadCounts) {
      if (typeof conversation.unreadCounts === 'object' && conversation.unreadCounts[user._id]) {
        unreadCount = conversation.unreadCounts[user._id] || 0;
      } else if (conversation.unreadCounts.participant1 !== undefined) {
        // Legacy structure
        unreadCount = conversation.participant1._id === user._id
          ? conversation.unreadCounts.participant2 || 0
          : conversation.unreadCounts.participant1 || 0;
      }
    }
    
    return {
      name: otherParticipant.name,
      avatar: otherParticipant.name.charAt(0).toUpperCase(),
      unreadCount
    };
  };

  const formatTimestamp = (dateString: string) => {
    const messageDate = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    if (messageDate.toDateString() === today.toDateString()) {
      // Today - show time
      return messageDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (messageDate.toDateString() === yesterday.toDateString()) {
      // Yesterday
      return 'Yesterday';
    } else {
      // Older - show date
      return messageDate.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  };

  const renderConversationItem = ({ item }: { item: Conversation }) => {
    const { name, avatar, unreadCount } = getConversationInfo(item);
    
    return (
      <TouchableOpacity 
        style={styles.conversationItem}
        onPress={() => {
          dispatch(setCurrentConversation(item));
          const groupId = item.conversationType === CONVERSATION_TYPES.GROUP ? item.groupId?._id : undefined;
          onNavigateToChat?.(item._id, name, groupId);
        }}
      >
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{avatar}</Text>
        </View>
        
        <View style={styles.conversationContent}>
          <View style={styles.conversationHeader}>
            <Text style={styles.participantName}>{name}</Text>
            {item.lastMessageAt && (
              <Text style={styles.timestamp}>
                {formatTimestamp(item.lastMessageAt)}
              </Text>
            )}
          </View>
          
          <View style={styles.messagePreview}>
            <Text style={styles.lastMessage} numberOfLines={1}>
              {item.lastMessage ? 
                (item.lastMessage.messageType === 'image' ? '📷 Image' : item.lastMessage.content) 
                : 'No messages yet'
              }
            </Text>
            {unreadCount > 0 && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadCount}>{unreadCount}</Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading conversations...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centerContainer}>
        <Ionicons name="alert-circle-outline" size={64} color={colors.error} />
        <Text style={styles.errorTitle}>Error</Text>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  // if (conversations.length === 0) {
  //   return (
  //     <View style={styles.centerContainer}>
  //       <Ionicons name="chatbubbles-outline" size={64} color={colors.textLight} />
  //       <Text style={styles.emptyTitle}>No Chats Yet</Text>
  //       <Text style={styles.emptySubtitle}>Start a conversation to see your chats here</Text>
  //     </View>
  //   );
  // }

  return (
    <View style={styles.container}>
      {
        conversations.length === 0 ? (
          <View style={styles.centerContainer}>
            <Ionicons name="chatbubbles-outline" size={64} color={colors.textLight} />
            <Text style={styles.emptyTitle}>No Chats Yet</Text>
            <Text style={styles.emptySubtitle}>Start a conversation to see your chats here</Text>
          </View>
        ) : (
          <FlatList
            data={conversations}
            renderItem={renderConversationItem}
            keyExtractor={(item) => item._id}
            extraData={conversations.map(c => JSON.stringify(c.unreadCounts)).join(',')}
            style={styles.conversationsList}
            showsVerticalScrollIndicator={false}
          />
        )
      }
      
      {canCreateGroup && (
        <TouchableOpacity 
          style={styles.floatingButton}
          onPress={() => setShowCreateGroupModal(true)}
        >
          <Ionicons name="add" size={24} color={colors.surface} />
        </TouchableOpacity>
      )}
      
      <CreateGroupModal
        visible={showCreateGroupModal}
        onClose={() => setShowCreateGroupModal(false)}
        onGroupCreated={() => dispatch(fetchConversations({ page: 1, limit: 20 }))}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing['3xl'],
  },
  conversationsList: {
    flex: 1,
  },
  conversationItem: {
    flexDirection: 'row',
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  avatarText: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    color: colors.surface,
  },
  conversationContent: {
    flex: 1,
  },
  conversationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  participantName: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text,
  },
  timestamp: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
  },
  messagePreview: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  lastMessage: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    flex: 1,
  },
  unreadBadge: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.sm,
  },
  unreadCount: {
    fontSize: typography.fontSize.xs,
    color: colors.surface,
    fontWeight: typography.fontWeight.semibold,
  },
  loadingText: {
    fontSize: typography.fontSize.base,
    color: colors.textSecondary,
    marginTop: spacing.md,
  },
  emptyTitle: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text,
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
  emptySubtitle: {
    fontSize: typography.fontSize.base,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  errorTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    color: colors.error,
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
  errorText: {
    fontSize: typography.fontSize.base,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  floatingButton: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  }
});