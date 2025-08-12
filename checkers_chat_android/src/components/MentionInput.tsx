import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, typography, spacing } from '../theme';

interface User {
  _id: string;
  name: string;
}

interface MentionInputProps {
  value: string;
  onChangeText: (text: string) => void;
  onMentionsChange: (mentions: string[]) => void;
  placeholder?: string;
  style?: any;
  groupMembers: User[];
  maxLength?: number;
  multiline?: boolean;
}

interface MentionData {
  id: string;
  name: string;
  startIndex: number;
  endIndex: number;
}

export const MentionInput: React.FC<MentionInputProps> = ({
  value,
  onChangeText,
  onMentionsChange,
  placeholder,
  style,
  groupMembers,
  maxLength,
  multiline = true
}) => {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<User[]>([]);
  const [mentionQuery, setMentionQuery] = useState('');
  const [cursorPosition, setCursorPosition] = useState(0);
  const [mentions, setMentions] = useState<MentionData[]>([]);
  const textInputRef = useRef<TextInput>(null);

  const handleTextChange = (text: string) => {
    onChangeText(text);
    
    // Find @ symbol and check for mentions - use text length as cursor position for simplicity
    const currentCursor = text.length;
    const atIndex = text.lastIndexOf('@');    
    if (atIndex !== -1 && atIndex <= currentCursor) {
      const query = text.substring(atIndex + 1, currentCursor);      
      // Check if there's a space, newline, or closing bracket (end of mention)
      if (query.includes(' ') || query.includes('\n') || query.includes(']')) {
        setShowSuggestions(false);
        setMentionQuery('');
        updateMentions(text);
        return;
      }
      
      setMentionQuery(query);
      
      // Filter group members based on query - show all if query is empty
      const filteredMembers = query === '' 
        ? groupMembers
        : groupMembers.filter(member => 
            member.name && member.name.toLowerCase().includes(query.toLowerCase())
          );
      
      setSuggestions(filteredMembers);
      const shouldShow = filteredMembers.length > 0;
      setShowSuggestions(shouldShow);
    } else {
      setShowSuggestions(false);
      setMentionQuery('');
    }
    
    // Update mentions array based on current text
    updateMentions(text);
  };

  const updateMentions = (text: string) => {
    // Simple approach - if text is cleared, clear mentions
    if (!text.trim()) {
      setMentions([]);
      onMentionsChange([]);
    }
  };

  const handleSuggestionPress = (user: User) => {
    const atIndex = value.lastIndexOf('@');
    const beforeMention = value.substring(0, atIndex);
    const userName = user.userId?.name || user.name;
    const userId = user.userId?._id || user._id;
    const mentionText = `@${userName}`;
    const newText = `${beforeMention}${mentionText} `;
    
    // Store the mention data separately
    const newMention = {
      id: userId,
      name: userName,
      startIndex: atIndex,
      endIndex: atIndex + mentionText.length
    };
    
    const updatedMentions = [...mentions, newMention];
    setMentions(updatedMentions);
    onMentionsChange(updatedMentions.map(m => m.id));
    
    onChangeText(newText);
    setShowSuggestions(false);
    setMentionQuery('');
  };

  const handleSelectionChange = (event: any) => {
    setCursorPosition(event.nativeEvent.selection.start);
  };

  const renderSuggestion = ({ item }: { item: User }) => {
    const userName = item?.userId?.name || item?.name;
    const initials = userName?.split(' ').map(n => n[0]).join('').toUpperCase() || '?';
    
    return (
      <TouchableOpacity
        style={styles.suggestionItem}
        onPress={() => handleSuggestionPress(item)}
        activeOpacity={0.7}
      >
        <View style={styles.avatarContainer}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <Text style={styles.suggestionText}>{userName}</Text>
      </TouchableOpacity>
    );
  };

  const renderTextWithMentions = () => {
    if (mentions.length === 0) return value;
    
    let result = [];
    let lastIndex = 0;
    
    mentions.forEach((mention, index) => {
      // Add text before mention
      if (mention.startIndex > lastIndex) {
        result.push(value.substring(lastIndex, mention.startIndex));
      }
      
      // Add highlighted mention
      result.push(`@${mention.name}`);
      lastIndex = mention.endIndex;
    });
    
    // Add remaining text
    if (lastIndex < value.length) {
      result.push(value.substring(lastIndex));
    }
    
    return result.join('');
  };

  return (
    <View style={styles.container}>
      <TextInput
        ref={textInputRef}
        style={[styles.textInput, style]}
        value={value}
        onChangeText={handleTextChange}
        onSelectionChange={handleSelectionChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textSecondary}
        multiline={multiline}
        maxLength={maxLength}
      />
      
      {showSuggestions && (
        <View style={styles.suggestionsContainer}>
          <FlatList
            data={suggestions}
            renderItem={renderSuggestion}
            keyExtractor={(item) => item._id}
            style={styles.suggestionsList}
            keyboardShouldPersistTaps="handled"
          />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  textInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    maxHeight: 100,
    fontSize: typography.fontSize.base,
    color: colors.text,
    backgroundColor: colors.background,
  },
  suggestionsContainer: {
    position: 'absolute',
    bottom: '100%',
    left: 0,
    right: 0,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    maxHeight: 200,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
    marginBottom: spacing.xs,
  },
  suggestionsList: {
    maxHeight: 200,
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  avatarContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  avatarText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.surface,
  },
  suggestionText: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.medium,
    color: colors.text,
    flex: 1,
  },
});