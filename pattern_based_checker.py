"""
Pattern-based AI Checker for WhatsApp Transaction Management
This version uses both AI and pattern matching for reliable responses
"""

import json
import re
import os
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()

@dataclass
class MessageContext:
    sender: str
    message: str
    timestamp: str
    is_checker: bool = False

class PatternBasedChecker:
    def __init__(self, gemini_api_key: str = None):
        """Initialize checker with optional Gemini API for advanced responses"""
        self.checker_number = "+971 58 201 5216"
        self.use_ai = False
        
        if gemini_api_key:
            try:
                genai.configure(api_key=gemini_api_key)
                self.model = genai.GenerativeModel('gemini-1.5-flash')
                self.use_ai = True
                print("AI mode enabled with Gemini")
            except Exception as e:
                print(f"AI initialization failed: {e}. Using pattern-based responses only.")
                self.use_ai = False
        else:
            print("No API key provided. Using pattern-based responses only.")
        
        self.load_patterns()
    
    def load_patterns(self):
        """Load response patterns for different scenarios"""
        self.patterns = {
            # Acknowledgment patterns
            'acknowledgment': {
                'patterns': [r'kar.{0,5}rh.{0,5}h.{0,3}sir', r'ok.{0,5}sir', r'hnji', r'theek.{0,5}hai'],
                'responses': [
                    "Jaldi karo, customer wait kar raha hai.",
                    "Time limit hai, fast complete karo.",
                    "Good, but jaldi finish karo."
                ]
            },
            
            # Technical issues
            'technical_issue': {
                'patterns': [r'server.{0,5}down', r'net.{0,5}(slow|issue|problem)', r'system.{0,5}(down|hang)', r'bank.{0,5}down'],
                'responses': [
                    "Technical issue hai? Alternative method try karo.",
                    "System problem hai to manual process use karo.",
                    "Server down hai to dusra account try karo."
                ]
            },
            
            # Not received
            'not_received': {
                'patterns': [r'not.{0,5}rec', r'nhi.{0,5}(mila|aya)', r'receive.{0,5}nhi'],
                'responses': [
                    "Not received? UTR properly check karo.",
                    "Payment nhi mila? Bank se confirm karo.",
                    "Abhi tak nhi aya? Details recheck karo."
                ]
            },
            
            # Slip/document issues
            'slip_issue': {
                'patterns': [r'slip.{0,5}(upload.{0,5}nhi|nhi.{0,5}ho)', r'date.{0,5}time.{0,5}show.{0,5}nhi'],
                'responses': [
                    "Slip upload nhi ho rha? Proper format me bhejo.",
                    "Client ko boliye slip properly upload kare.",
                    "Date time show nhi ho rha? Retry karo proper slip ke sath."
                ]
            },
            
            # ID/verification issues
            'id_issue': {
                'patterns': [r'id.{0,5}show.{0,5}nhi', r'id.{0,5}(nhi.{0,5}mil|not.{0,5}found)'],
                'responses': [
                    "ID show nhi ho rhi? Client se proper details manga.",
                    "Database me check karo properly.",
                    "Alternative branch try karo ID ke liye."
                ]
            },
            
            # Time-related excuses
            'time_excuse': {
                'patterns': [r'lunch.{0,5}kar.{0,5}rah', r'khana.{0,5}kha.{0,5}rah', r'break.{0,5}hai', r'\d+.{0,5}minute'],
                'responses': [
                    "Lunch break samajh gaya, but jaldi khatam kar ke kaam karo.",
                    "Time hai limited, break ke baad immediately start karo.",
                    "Customer wait kar raha hai, jaldi complete karo."
                ]
            },
            
            # Completion confirmations
            'completed': {
                'patterns': [r'ho.{0,5}g.{0,2}ya', r'done', r'complete', r'approved?', r'clear.{0,5}kar.{0,5}diya'],
                'responses': [
                    "Excellent! Next transaction ready karo.",
                    "Good job! Keep the pace up.",
                    "Perfect! Client ko inform kar do."
                ]
            },
            
            # Checking/processing
            'checking': {
                'patterns': [r'checking.{0,5}sir', r'wait.{0,5}checking', r'dekh.{0,5}rah'],
                'responses': [
                    "Jaldi check karo, time limit hai.",
                    "Fast checking karo aur update do.",
                    "Customer wait kar raha hai, quick check karo."
                ]
            }
        }
    
    def classify_by_pattern(self, message: str) -> Tuple[str, List[str]]:
        """Classify message using pattern matching"""
        message_lower = message.lower()
        
        for category, data in self.patterns.items():
            for pattern in data['patterns']:
                if re.search(pattern, message_lower):
                    return category, data['responses']
        
        return 'other', ["Main sirf transaction related queries handle kar sakta hun."]
    
    def generate_response(self, franchise_message: str, context_messages: List[str] = None) -> str:
        """Generate response using pattern matching + optional AI enhancement"""
        
        # First try pattern matching
        category, pattern_responses = self.classify_by_pattern(franchise_message)
        
        if category != 'other':
            # Pick response based on context or randomly
            import random
            base_response = random.choice(pattern_responses)
            
            # If AI is available, enhance the response
            if self.use_ai and random.random() > 0.5:  # 50% chance to use AI enhancement
                try:
                    ai_prompt = f"""
                    Enhance this response to be more natural and contextual:
                    Base response: "{base_response}"
                    Original message: "{franchise_message}"
                    
                    Make it sound more natural in Hinglish while keeping the same meaning.
                    Keep it short (max 15 words):
                    """
                    
                    ai_response = self.model.generate_content(ai_prompt)
                    return ai_response.text.strip()
                except:
                    pass
            
            return base_response
        
        # For 'other' category, use AI if available
        if self.use_ai:
            try:
                return self._generate_ai_response(franchise_message, context_messages)
            except:
                pass
        
        return "Transaction ke bare me baat karte hai. Main sirf transaction help kar sakta hun."
    
    def _generate_ai_response(self, franchise_message: str, context_messages: List[str] = None) -> str:
        """Generate AI response for complex cases"""
        context = ""
        if context_messages:
            context = "\\n".join(context_messages[-3:])
        
        prompt = f"""
        You are a transaction checker in a financial services WhatsApp group.
        Respond in Hinglish (Hindi + English mix) like: "Jaldi karo sir, customer wait kar raha hai"
        
        Context: {context}
        Franchise message: "{franchise_message}"
        
        Respond in 1-2 short sentences maximum. Be authoritative but helpful.
        """
        
        response = self.model.generate_content(prompt)
        return response.text.strip()
    
    def parse_message(self, raw_message: str) -> Optional[MessageContext]:
        """Parse WhatsApp message format"""
        pattern = r'(\d{2}/\d{2}/\d{4}, \d{1,2}:\d{2} [ap]m) - (\+[\d\s\(\)]+): (.+)'
        match = re.match(pattern, raw_message)
        
        if match:
            timestamp, sender, message = match.groups()
            is_checker = sender.strip() == self.checker_number
            
            return MessageContext(
                timestamp=timestamp,
                sender=sender.strip(),
                message=message.strip(),
                is_checker=is_checker
            )
        return None
    
    def process_live_message(self, message: str, sender: str = None) -> str:
        """Process a single live message and return AI response"""
        
        # Check if it's from checker (don't respond to checker)
        if sender == self.checker_number:
            return None
        
        # Generate response
        response = self.generate_response(message)
        return response

def main():
    """Test the pattern-based checker"""
    
    # Initialize with optional AI
    api_key = os.getenv("GEMINI_API_KEY")
    checker = PatternBasedChecker(api_key)
    
    # Test messages
    test_cases = [
        "kar rhe ha sir",
        "bank server down hai sir",
        "not rec abhi tak",
        "lunch kar rahe hai 30 minute",
        "slip upload nhi ho rha net issue",
        "ho gya sir approved",
        "checking sir wait",
        "id show nhi ho rhi database me",
        "system hang ho raha hai",
        "Hello how are you?",  # Should be categorized as 'other'
    ]
    
    print("\\n=== Pattern-Based Checker Testing ===\\n")
    
    for message in test_cases:
        print(f"Franchise: {message}")
        response = checker.generate_response(message)
        print(f"AI Checker: {response}")
        print("-" * 60)

if __name__ == "__main__":
    main()