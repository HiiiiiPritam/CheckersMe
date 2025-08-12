import React, { useState, useRef, useEffect } from 'react';
import { groupService } from '../../services/groupService';
import './MentionInput.css';

const MentionInput = ({ 
  value, 
  onChange, 
  onMentionsChange, 
  groupId, 
  placeholder = "Type a message...",
  disabled = false 
}) => {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [mentionQuery, setMentionQuery] = useState('');
  const [cursorPosition, setCursorPosition] = useState(0);
  const [mentions, setMentions] = useState([]);
  const [groupMembers, setGroupMembers] = useState([]);
  
  const inputRef = useRef(null);
  const suggestionsRef = useRef(null);

  // Fetch group members when component mounts or groupId changes
  useEffect(() => {
    if (groupId) {
      fetchGroupMembers();
    }
  }, [groupId]);

  const fetchGroupMembers = async () => {
    try {
      const response = await groupService.getGroupDetails(groupId);
      if (response.success && response.data.members) {
        setGroupMembers(response.data.members);
      }
    } catch (error) {
      console.error('Error fetching group members:', error);
    }
  };

  // Handle input change
  const handleInputChange = (e) => {
    const newValue = e.target.value;
    const position = e.target.selectionStart;
    
    onChange(newValue);
    setCursorPosition(position);
    
    // Check if user typed @ symbol
    const textBeforeCursor = newValue.substring(0, position);
    const mentionMatch = textBeforeCursor.match(/@(\w*)$/);
    
    if (mentionMatch) {
      const query = mentionMatch[1].toLowerCase();
      setMentionQuery(query);
      
      // Filter members based on query
      const filteredMembers = groupMembers.filter(member => 
        member.userId.name.toLowerCase().includes(query) ||
        member.userId.email.toLowerCase().includes(query)
      );
      
      setSuggestions(filteredMembers);
      setShowSuggestions(true);
    } else {
      setShowSuggestions(false);
      setSuggestions([]);
      setMentionQuery('');
    }
  };

  // Handle mention selection
  const handleMentionSelect = (member) => {
    const textBeforeCursor = value.substring(0, cursorPosition);
    const textAfterCursor = value.substring(cursorPosition);
    
    // Find the @ symbol position
    const mentionStartIndex = textBeforeCursor.lastIndexOf('@');
    
    // Replace @query with @username
    const beforeMention = value.substring(0, mentionStartIndex);
    const mentionText = `@${member.userId.name}`;
    const newValue = beforeMention + mentionText + ' ' + textAfterCursor;
    
    // Update mentions array
    const newMention = {
      id: member.userId._id,
      name: member.userId.name,
      startIndex: mentionStartIndex,
      endIndex: mentionStartIndex + mentionText.length
    };
    
    const updatedMentions = [...mentions, newMention];
    setMentions(updatedMentions);
    
    // Call parent callbacks
    onChange(newValue);
    onMentionsChange(updatedMentions.map(m => m.id));
    
    // Hide suggestions
    setShowSuggestions(false);
    setSuggestions([]);
    setMentionQuery('');
    
    // Focus back to input
    setTimeout(() => {
      if (inputRef.current) {
        const newCursorPos = mentionStartIndex + mentionText.length + 1;
        inputRef.current.focus();
        inputRef.current.setSelectionRange(newCursorPos, newCursorPos);
      }
    }, 0);
  };

  // Handle key navigation in suggestions
  const handleKeyDown = (e) => {
    if (showSuggestions && suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        // Handle arrow down navigation
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        // Handle arrow up navigation
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (suggestions.length > 0) {
          handleMentionSelect(suggestions[0]);
        }
      } else if (e.key === 'Escape') {
        setShowSuggestions(false);
      }
    }
  };

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(event.target)) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Render text with highlighted mentions
  const renderTextWithMentions = () => {
    if (!value) return null;
    
    const parts = [];
    let lastIndex = 0;
    
    // Find all @mentions in the text
    const mentionRegex = /@(\w+)/g;
    let match;
    
    while ((match = mentionRegex.exec(value)) !== null) {
      // Add text before mention
      if (match.index > lastIndex) {
        parts.push(value.substring(lastIndex, match.index));
      }
      
      // Add highlighted mention
      parts.push(
        <span key={match.index} className="mention-highlight">
          {match[0]}
        </span>
      );
      
      lastIndex = match.index + match[0].length;
    }
    
    // Add remaining text
    if (lastIndex < value.length) {
      parts.push(value.substring(lastIndex));
    }
    
    return parts;
  };

  return (
    <div className="mention-input-container">
      <div className="mention-input-wrapper">
        <textarea
          ref={inputRef}
          value={value}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className="mention-input"
          rows={1}
          style={{ resize: 'none', overflow: 'hidden' }}
          onInput={(e) => {
            // Auto-resize textarea
            e.target.style.height = 'auto';
            e.target.style.height = e.target.scrollHeight + 'px';
          }}
        />
        
        {/* Suggestions dropdown */}
        {showSuggestions && suggestions.length > 0 && (
          <div ref={suggestionsRef} className="mention-suggestions">
            {suggestions.map((member) => (
              <div
                key={member.userId._id}
                className="mention-suggestion-item"
                onClick={() => handleMentionSelect(member)}
              >
                <div className="member-avatar">
                  {member.userId.name.charAt(0).toUpperCase()}
                </div>
                <div className="member-info">
                  <div className="member-name">{member.userId.name}</div>
                  <div className="member-email">{member.userId.email}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MentionInput;