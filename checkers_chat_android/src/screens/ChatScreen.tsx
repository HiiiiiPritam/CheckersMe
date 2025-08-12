import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, BackHandler, TouchableWithoutFeedback, Keyboard, ActivityIndicator, Alert, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useDispatch, useSelector } from 'react-redux';
import { colors, typography, spacing } from '../theme';
import { RootState, AppDispatch } from '../store';
import { fetchMessages, sendMessage, sendImageMessage, addMessage, loadMoreMessages } from '../store/slices/chatSlice';
import { Message } from '../types/chat.types';
import { socketService } from '../services/socketService';
import { MentionInput } from '../components/MentionInput';
import { groupService } from '../services/groupService';

interface ChatScreenProps {
  route: {
    params: {
      conversationId: string;
      participantName: string;
    };
  };
  navigation: any;
}

export const ChatScreen: React.FC<ChatScreenProps> = ({ route, navigation }) => {
  const { conversationId, participantName } = route.params;
  const dispatch = useDispatch<AppDispatch>();
  const { messages, messagesLoading, loadingMore, hasMoreMessages, currentPage, currentConversation, error } = useSelector((state: RootState) => state.chat);
  const { user, token } = useSelector((state: RootState) => state.auth);
  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);
  const [currentDate, setCurrentDate] = useState('');
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [showMessageOptions, setShowMessageOptions] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [popupPosition, setPopupPosition] = useState({ x: 0, y: 0 });
  const [mentions, setMentions] = useState<string[]>([]);
  const [groupMembers, setGroupMembers] = useState<any[]>([]);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [fullScreenImage, setFullScreenImage] = useState<string | null>(null);
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    dispatch(fetchMessages({ conversationId }));
    
    // Scroll to bottom when entering chat
    setTimeout(() => {
      flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
    }, 500);
    
    // Fetch group members if it's a group chat
    const fetchGroupMembers = async () => {
      if (currentConversation?.conversationType === 'group' && currentConversation.groupId) {
        try {
          const groupId = typeof currentConversation.groupId === 'string' 
            ? currentConversation.groupId 
            : currentConversation.groupId._id;
          
          const groupDetails = await groupService.getGroupDetails(groupId);
          setGroupMembers(groupDetails.members || []);
        } catch (error) {
          console.error('Error fetching group members:', error);
        }
      }
    };
    
    fetchGroupMembers();
    
    if (token) {
      const chatHandler = (data: any) => {
        if (data.message && data.message.conversationId === conversationId && data.message.senderId._id !== user?._id) {
          dispatch(addMessage(data.message));
          setTimeout(() => {
            flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
          }, 100);
        }
      };
      
      socketService.on('new_message', chatHandler);
      
      // Join conversation room
      const timer = setTimeout(() => {
        socketService.joinConversation(conversationId);
      }, 500);
      
      return () => {
        clearTimeout(timer);
        socketService.leaveConversation(conversationId);
        socketService.off('new_message', chatHandler);
      };
    }
  }, [dispatch, conversationId, token, user, currentConversation]);

  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      navigation.goBack();
      return true;
    });

    const show = Keyboard.addListener('keyboardDidShow', (e) => {
      setKeyboardHeight(e.endCoordinates.height);
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardHeight(0);
    });

    return () => {
      backHandler.remove();
      show.remove();
      hide.remove();
    };
  }, [navigation]);

  const handleSendMessage = async () => {
    if ((!messageText.trim() && !imagePreview) || sending) return;

    setSending(true);
    try {
      if (imagePreview) {
        // Send image message (with or without text)
        await dispatch(sendImageMessage({ 
          conversationId, 
          imageUri: imagePreview,
          content: messageText.trim() || undefined,
          replyTo: replyingTo?._id,
          mentions: mentions.length > 0 ? mentions : undefined
        })).unwrap();
      } else {
        // Send text-only message
        const messageData: any = { conversationId, content: messageText.trim() };
        if (replyingTo) {
          messageData.replyTo = replyingTo._id;
        }
        if (mentions.length > 0) {
          messageData.mentions = mentions;
        }
        await dispatch(sendMessage(messageData)).unwrap();
      }
      
      setMessageText('');
      setMentions([]);
      setReplyingTo(null);
      setImagePreview(null);
      setTimeout(() => {
        flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
      }, 100);
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setSending(false);
    }
  };

  const handleImagePicker = () => {
    openGallery();
  };

  const openGallery = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Gallery permission is required to select photos.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setImagePreview(result.assets[0].uri);
      }
    } catch (error) {
    }
  };

  const handleSendImage = async (imageUri: string) => {
    setSending(true);
    try {
      await dispatch(sendImageMessage({ conversationId, imageUri })).unwrap();
      setTimeout(() => {
        flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
      }, 100);
    } catch (error) {
      console.error('Error sending image:', error);
    } finally {
      setSending(false);
    }
  };

  const formatDate = (date: string) => {
    const messageDate = new Date(date);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (messageDate.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (messageDate.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    } else {
      return messageDate.toLocaleDateString();
    }
  };

  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems.length > 0) {
      const firstVisibleMessage = viewableItems[0].item;
      const messageDate = formatDate(firstVisibleMessage.createdAt);
      setCurrentDate(messageDate);
    }
  }).current;

  const onScroll = (event: any) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const isAtBottom = contentOffset.y <= 200;
    setShowScrollButton(!isAtBottom);
  };

  const scrollToBottom = () => {
    flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
    setShowScrollButton(false);
  };

  const handleLoadMore = async () => {
    if (!loadingMore && hasMoreMessages) {
      dispatch(loadMoreMessages({ conversationId, page: currentPage + 1 }));
    }
  };

  const handleLongPress = (message: Message, event: any) => {
    const { pageX, pageY } = event.nativeEvent;
    setSelectedMessage(message);
    setPopupPosition({ x: pageX, y: pageY - 50 });
    setShowMessageOptions(true);
  };

  const handleReply = () => {
    if (selectedMessage) {
      setReplyingTo(selectedMessage);
    }
    setShowMessageOptions(false);
    setSelectedMessage(null);
  };

  const renderMessageContent = (content: string, isOwnMessage: boolean) => {
    if (!content) return '';
    
    try {
      // Handle mentions in the content
      const mentionRegex = /@\[(.*?)\]\((.*?)\)/g;
      const parts = [];
      let lastIndex = 0;
      let match;
      let matchCount = 0;
      
      while ((match = mentionRegex.exec(content)) !== null && matchCount < 50) { // Prevent infinite loops
        matchCount++;
        
        // Add text before mention
        if (match.index > lastIndex) {
          parts.push(content.substring(lastIndex, match.index));
        }
        
        // Add mention with styling
        parts.push(
          <Text key={`mention-${match.index}-${matchCount}`} style={[styles.mentionText, isOwnMessage ? styles.ownMentionText : styles.otherMentionText]}>
            @{match[1]}
          </Text>
        );
        
        lastIndex = match.index + match[0].length;
      }
      
      // Add remaining text
      if (lastIndex < content.length) {
        parts.push(content.substring(lastIndex));
      }
      
      return parts.length > 1 ? parts : content;
    } catch (error) {
      console.error('Error rendering message content:', error);
      return content; // Fallback to original content
    }
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isOwnMessage = item.senderId._id === user?._id;
    const isGroupChat = currentConversation?.conversationType === 'group';
    
    return (
      <TouchableOpacity
        style={[styles.messageContainer, isOwnMessage ? styles.ownMessage : styles.otherMessage]}
        onLongPress={(event) => handleLongPress(item, event)}
        delayLongPress={500}
      >
        <View style={[styles.messageBubble, isOwnMessage ? styles.ownBubble : styles.otherBubble]}>
          {isGroupChat && !isOwnMessage && (
            <Text style={styles.senderName}>{item.senderId.name}</Text>
          )}
          {item.replyTo && (
            <View style={styles.replyContainer}>
              <View style={styles.replyBar} />
              <View style={styles.replyContent}>
                <Text style={styles.replyAuthor}>{item.replyTo.senderId.name}</Text>
                <Text style={styles.replyText} numberOfLines={1}>
                  {item.replyTo.messageType === 'image' ? 'Image' : item.replyTo.content}
                </Text>
              </View>
            </View>
          )}
          {item.messageType === 'image' && item.metadata?.fileUrl && (
            <TouchableOpacity onPress={() => setFullScreenImage(item.metadata.fileUrl)}>
              <Image
                source={{ uri: item.metadata.fileUrl }}
                style={styles.messageImage}
                contentFit="cover"
              />
            </TouchableOpacity>
          )}
          {item.content && item.content !== '[Image]' && (
            <Text style={[styles.messageText, isOwnMessage ? styles.ownMessageText : styles.otherMessageText]}>
              {renderMessageContent(item.content, isOwnMessage)}
            </Text>
          )}
          <Text style={[styles.messageTime, isOwnMessage ? styles.ownMessageTime : styles.otherMessageTime]}>
            {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderHeader = () => {
    if (!loadingMore) return null;
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color={colors.primary} />
        <Text style={styles.loadingText}>Loading messages...</Text>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <SafeAreaView style={{ flex: 1 }} edges={['bottom']}>
        <View style={{ flex: 1, flexDirection: 'column' }}>
          {currentDate && (
            <View style={styles.dateHeader}>
              <Text style={styles.dateText}>{currentDate}</Text>
            </View>
          )}
          <FlatList
            ref={flatListRef}
            inverted
            renderItem={renderMessage}
            keyExtractor={(item) => item._id}
            style={styles.messagesList}
            contentContainerStyle={styles.messagesContainer}
            showsVerticalScrollIndicator={false}
            maintainVisibleContentPosition={{
              minIndexForVisible: 0,
              autoscrollToTopThreshold: 10
            }}
            onScroll={onScroll}
            scrollEventThrottle={16}
            onViewableItemsChanged={onViewableItemsChanged}
            viewabilityConfig={{ itemVisiblePercentThreshold: 50 }}
            keyboardShouldPersistTaps="handled"
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.1}
            ListFooterComponent={renderHeader}
            data={[...messages].reverse()}
          />
          {imagePreview && (
            <View style={styles.imagePreviewContainer}>
              <Image
                source={{ uri: imagePreview }}
                style={styles.imagePreview}
                contentFit="cover"
              />
              <TouchableOpacity onPress={() => setImagePreview(null)} style={styles.removeImageButton}>
                <Ionicons name="close-circle" size={24} color={colors.error} />
              </TouchableOpacity>
            </View>
          )}
          {replyingTo && (
            <View style={styles.replyPreview}>
              <View style={styles.replyPreviewBar} />
              <View style={styles.replyPreviewContent}>
                <Text style={styles.replyPreviewAuthor}>Replying to {replyingTo.senderId.name}</Text>
                <Text style={styles.replyPreviewText} numberOfLines={1}>
                  {replyingTo.messageType === 'image' ? 'Image' : replyingTo.content}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setReplyingTo(null)} style={styles.replyPreviewClose}>
                <Ionicons name="close" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
          )}
          <View style={styles.inputContainer}>
            <TouchableOpacity 
              style={styles.imageButton}
              onPress={handleImagePicker}
              disabled={sending}
              activeOpacity={0.7}
            >
              <Ionicons name="image" size={24} color={colors.primary} />
            </TouchableOpacity>
            {currentConversation?.conversationType === 'group' ? (
              <MentionInput
                value={messageText}
                onChangeText={setMessageText}
                onMentionsChange={setMentions}
                placeholder="Type a message..."
                style={styles.textInput}
                groupMembers={groupMembers}
                maxLength={1000}
                multiline
              />
            ) : (
              <TextInput
                style={styles.textInput}
                value={messageText}
                onChangeText={setMessageText}
                placeholder="Type a message..."
                placeholderTextColor={colors.textSecondary}
                multiline
                maxLength={1000}
              />
            )}
            <TouchableOpacity 
              style={[styles.sendButton, ((!messageText.trim() && !imagePreview) || sending) && styles.sendButtonDisabled]}
              onPress={handleSendMessage}
              disabled={(!messageText.trim() && !imagePreview) || sending}
            >
              <Ionicons name={sending ? "hourglass" : "send"} size={20} color={colors.surface} />
            </TouchableOpacity>
          </View>
          
          {showScrollButton && (
            <TouchableOpacity 
              style={styles.scrollToBottomButton}
              onPress={scrollToBottom}
            >
              <Ionicons name="chevron-down" size={24} color={colors.surface} />
            </TouchableOpacity>
          )}
        </View>
        
        {/* Message Options Modal */}
        <Modal
          visible={showMessageOptions}
          transparent
          animationType="fade"
          onRequestClose={() => setShowMessageOptions(false)}
        >
          <TouchableOpacity 
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setShowMessageOptions(false)}
          >
            <View style={[styles.messageOptionsModal, { position: 'absolute', left: popupPosition.x - 50, top: popupPosition.y }]}>
              <TouchableOpacity style={styles.optionButton} onPress={handleReply}>
                <Ionicons name="arrow-undo" size={20} color={colors.primary} />
                <Text style={styles.optionText}>Reply</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.optionButton} 
                onPress={() => setShowMessageOptions(false)}
              >
                <Ionicons name="close" size={20} color={colors.textSecondary} />
                <Text style={styles.optionText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>

        {/* Full Screen Image Preview Modal */}
        <Modal
          visible={!!fullScreenImage}
          transparent
          animationType="fade"
          onRequestClose={() => setFullScreenImage(null)}
        >
          <TouchableOpacity 
            style={styles.fullScreenOverlay}
            activeOpacity={1}
            onPress={() => setFullScreenImage(null)}
          >
            <View style={styles.fullScreenImageContainer}>
              <Image
                source={{ uri: fullScreenImage || '' }}
                style={styles.fullScreenImage}
                contentFit="contain"
              />
            </View>
            <TouchableOpacity 
              style={styles.closeButton}
              onPress={() => setFullScreenImage(null)}
            >
              <Ionicons name="close" size={24} color={colors.surface} />
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  chatContainer: {
    flex: 1,
    backgroundColor: colors.chatBackground,
  },
  messagesList: {
    flex: 1,
  },
  messagesContainer: {
    padding: spacing.md,
  },
  messageContainer: {
    marginVertical: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  ownMessage: {
    alignItems: 'flex-end',
  },
  otherMessage: {
    alignItems: 'flex-start',
  },
  messageBubble: {
    maxWidth: '75%',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 18,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  ownBubble: {
    backgroundColor: colors.primarySolid,
    borderBottomRightRadius: 6,
    marginLeft: spacing.xl,
  },
  otherBubble: {
    backgroundColor: colors.surface,
    borderBottomLeftRadius: 6,
    marginRight: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
  },
  messageText: {
    fontSize: typography.fontSize.sm,
    lineHeight: 18,
    marginBottom: spacing.xs,
  },
  ownMessageText: {
    color: colors.background,
  },
  otherMessageText: {
    color: colors.text,
  },
  messageTime: {
    fontSize: typography.fontSize.xs,
    alignSelf: 'flex-end',
  },
  ownMessageTime: {
    color: 'rgba(255, 255, 255, 0.8)',
  },
  otherMessageTime: {
    color: colors.textLight,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  imageButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  textInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginRight: spacing.sm,
    maxHeight: 100,
    fontSize: typography.fontSize.base,
    color: colors.text,
    backgroundColor: colors.background,
  },
  messageImage: {
    width: 200,
    height: 150,
    borderRadius: 12,
    marginBottom: spacing.xs,
  },
  sendButton: {
    backgroundColor: colors.primary,
    borderRadius: 20,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: colors.textLight,
  },
  dateHeader: {
    position: 'absolute',
    top: spacing.sm,
    left: 0,
    right: 0,
    zIndex: 1000,
    alignItems: 'center',
  },
  dateText: {
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    color: colors.background,
    fontSize: typography.fontSize.xs,
    fontWeight: '500',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: 10,
    overflow: 'hidden',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
  },
  loadingText: {
    marginLeft: spacing.sm,
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
  },
  scrollToBottomButton: {
    position: 'absolute',
    bottom: 80,
    right: spacing.md,
    width: 37,
    height: 37,
    borderRadius: 24,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.10,
    shadowRadius: 4,
    elevation: 5,
  },
  replyContainer: {
    flexDirection: 'row',
    marginBottom: spacing.xs,
    paddingLeft: spacing.xs,
  },
  replyBar: {
    width: 3,
    backgroundColor: colors.primary,
    borderRadius: 2,
    marginRight: spacing.xs,
  },
  replyContent: {
    flex: 1,
  },
  replyAuthor: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    color: colors.primary,
    marginBottom: 2,
  },
  replyText: {
    fontSize: typography.fontSize.xs,
    color: 'rgba(255, 255, 255, 0.9)',
    fontStyle: 'italic',
  },
  replyPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  replyPreviewBar: {
    width: 3,
    height: 40,
    backgroundColor: colors.primary,
    borderRadius: 2,
    marginRight: spacing.sm,
  },
  replyPreviewContent: {
    flex: 1,
  },
  replyPreviewAuthor: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    color: colors.primary,
    marginBottom: 2,
  },
  replyPreviewText: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
  },
  replyPreviewClose: {
    padding: spacing.xs,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  messageOptionsModal: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: spacing.sm,
    minWidth: 120,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  optionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  optionText: {
    fontSize: typography.fontSize.base,
    color: colors.text,
    marginLeft: spacing.sm,
  },
  senderName: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    color: colors.primary,
    marginBottom: spacing.xs,
  },
  mentionText: {
    fontWeight: typography.fontWeight.bold,
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
  },
  ownMentionText: {
    color: '#FFD700',
    backgroundColor: 'rgba(255, 215, 0, 0.2)',
  },
  otherMentionText: {
    color: '#007AFF',
    backgroundColor: 'rgba(0, 122, 255, 0.1)',
  },
  imagePreviewContainer: {
    position: 'relative',
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: spacing.md,
  },
  imagePreview: {
    width: 120,
    height: 120,
    borderRadius: 8,
  },
  removeImageButton: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: 12,
  },
  fullScreenOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  fullScreenOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  fullScreenImageContainer: {
    width: '90%',
    height: '80%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullScreenImage: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
  },
  closeButton: {
    position: 'absolute',
    top: 50,
    right: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 24,
    width: 48,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
});