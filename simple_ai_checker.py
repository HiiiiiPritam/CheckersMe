import json
import re
import os
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass
import google.generativeai as genai
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

@dataclass
class MessageContext:
    sender: str
    message: str
    timestamp: str
    is_checker: bool = False

class TransactionCheckerAI:
    def __init__(self, gemini_api_key: str):
        """Initialize the AI checker with Gemini API"""
        self.gemini_api_key = gemini_api_key
        self.checker_number = "+971 58 201 5216"
        
        # Initialize Gemini
        genai.configure(api_key=gemini_api_key)
        self.model = genai.GenerativeModel('gemini-1.5-flash')
        
        # Load scenarios and context
        self.load_scenarios()
        
    def load_scenarios(self):
        """Load transaction scenarios from JSON file"""
        try:
            with open('transaction_scenarios.json', 'r', encoding='utf-8') as f:
                self.scenarios = json.load(f)
        except FileNotFoundError:
            print("Warning: transaction_scenarios.json not found. Using default scenarios.")
            self.scenarios = self._get_default_scenarios()
    
    def _get_default_scenarios(self):
        """Default scenarios if file is not found"""
        return {
            "scenarios": {
                "slip_request": {
                    "description": "Checker requests slip from franchise",
                    "ai_responses": ["Jaldi slip send karo", "Time limit hai, slip bhejo"]
                }
            },
            "ai_response_templates": {
                "urgency": ["Jaldi karo, customer wait kar raha hai."],
                "technical_help": ["Technical issue hai to alternative try karo."],
                "approval": ["Approved! Next transaction ready karo."]
            }
        }
    
    def parse_message(self, raw_message: str) -> Optional[MessageContext]:
        """Parse WhatsApp message format"""
        # Pattern: DD/MM/YYYY, HH:MM [am/pm] - +number: message
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
    
    def classify_message(self, message: str) -> Tuple[str, float]:
        """Classify message into scenario categories using Gemini"""
        
        # Create classification prompt
        classification_prompt = f"""
        Classify this Hinglish message into one of these categories:
        
        Categories:
        1. slip_request - Requesting payment slip/receipt
        2. transaction_check - Checking if payment received  
        3. bank_details_request - Asking for bank account details
        4. approval_request - Requesting transaction approval
        5. time_delay_complaint - Complaining about delays
        6. id_verification - ID checking requests
        7. other - Doesn't fit above categories
        
        Message: "{message}"
        
        Respond with only the category name and confidence score (0.0-1.0):
        Format: category_name,confidence_score
        """
        
        try:
            response = self.model.generate_content(classification_prompt)
            result = response.text.strip().split(',')
            category = result[0].strip()
            confidence = float(result[1].strip()) if len(result) > 1 else 0.5
            return category, confidence
        except Exception as e:
            print(f"Classification error: {e}")
            return "other", 0.0
    
    def generate_response(self, franchise_message: str, context_messages: List[str] = None) -> str:
        """Generate appropriate AI response based on franchise message"""
        
        # Classify the message
        category, confidence = self.classify_message(franchise_message)
        
        # Build context from recent messages
        context = ""
        if context_messages:
            context = "\\n".join(context_messages[-3:])  # Last 3 messages for context
        
        # Create response generation prompt
        response_prompt = f"""
        You are an AI transaction checker for a financial services company. 
        You communicate in Hinglish (Hindi concepts in English text) like a human checker would.
        
        Context from recent messages:
        {context}
        
        Current franchise message: "{franchise_message}"
        Message category: {category}
        
        Guidelines:
        - Be direct and authoritative like a real checker
        - Use Hinglish (mix of Hindi and English)
        - Keep responses short and action-oriented
        - Show urgency for pending transactions
        - Be helpful but firm about deadlines
        
        Common response types:
        - For delays: "Jaldi karo, customer wait kar raha hai"
        - For technical issues: "Alternative method try karo"
        - For approvals: "Good! Next transaction ready karo"
        - For problems: "Client se proper details manga"
        
        Generate a suitable response (max 2 lines):
        """

        print(f"Category: {category}, Confidence: {confidence}")
        
        try:
            response = self.model.generate_content(response_prompt)
            return response.text.strip()
        except Exception as e:
            print(f"Response generation error: {e}")
            return self._get_fallback_response(category)
    
    def _get_fallback_response(self, category: str) -> str:
        """Fallback responses if AI fails"""
        fallbacks = {
            "slip_request": "Jaldi slip send karo, time limit hai.",
            "transaction_check": "Fast check karo aur confirm karo.",
            "bank_details_request": "Active bank details send karo with validity.",
            "approval_request": "Details confirm kar ke approve karo.",
            "time_delay_complaint": "Process fast karo, customer wait kar raha hai.",
            "id_verification": "ID properly check kar ke confirm karo.",
            "other": "Transaction related query hai to batao, main help karunga."
        }
        return fallbacks.get(category, "Samajh nhi aya, phir se batao.")
    
    def process_chat_conversation(self, messages: List[str]) -> List[Dict]:
        """Process a series of WhatsApp messages and generate AI responses"""
        
        processed_messages = []
        context_messages = []
        
        for raw_message in messages:
            parsed = self.parse_message(raw_message)
            
            if parsed:
                # Store message info
                message_info = {
                    "timestamp": parsed.timestamp,
                    "sender": parsed.sender,
                    "message": parsed.message,
                    "is_checker": parsed.is_checker,
                    "ai_response": None
                }
                
                # If it's a franchise message (not from checker), generate AI response
                if not parsed.is_checker:
                    ai_response = self.generate_response(parsed.message, context_messages)
                    message_info["ai_response"] = ai_response
                
                processed_messages.append(message_info)
                context_messages.append(f"{parsed.sender}: {parsed.message}")
        
        return processed_messages

def main():
    """Example usage"""
    
    # You need to set your Gemini API key
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        print("Please set GEMINI_API_KEY environment variable")
        print("Create a .env file with: GEMINI_API_KEY=your_api_key_here")
        return
    
    # Initialize AI checker
    ai_checker = TransactionCheckerAI(api_key)
    
    # Example franchise messages to test
    test_messages = [
        "Bank server down hai sir, thoda time lagega",
        "kar rhe ha sir",
        "not rec abhi tak",
        "lunch kar rahe hai, 30 minute baad karunga",
        "slip upload nhi ho rha, net issue hai",
        "approved sir",
        "checking sir wait"
    ]
    
    print("\\n=== AI Checker Bot Testing ===\\n")
    
    for message in test_messages:
        print(f"Franchise: {message}")
        try:
            response = ai_checker.generate_response(message)
            print(f"AI Checker: {response}")
        except Exception as e:
            print(f"Error: {e}")
        print("-" * 50)

if __name__ == "__main__":
    main()