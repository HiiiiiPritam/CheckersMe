"""
WhatsApp Integration for AI Transaction Checker
This module provides functions to integrate with WhatsApp Business API
"""

import json
import requests
from typing import Dict, List, Optional
from simple_ai_checker import TransactionCheckerAI
import os
from dotenv import load_dotenv

load_dotenv()

class WhatsAppIntegration:
    def __init__(self, ai_checker: TransactionCheckerAI, webhook_verify_token: str = None):
        self.ai_checker = ai_checker
        self.webhook_verify_token = webhook_verify_token or "your_webhook_verify_token"
        
    def parse_whatsapp_webhook(self, webhook_data: Dict) -> Optional[Dict]:
        """Parse incoming WhatsApp webhook data"""
        try:
            # Extract message data from WhatsApp webhook format
            entry = webhook_data.get('entry', [{}])[0]
            changes = entry.get('changes', [{}])[0]
            value = changes.get('value', {})
            messages = value.get('messages', [])
            
            if messages:
                message = messages[0]
                return {
                    'from': message.get('from'),
                    'text': message.get('text', {}).get('body'),
                    'timestamp': message.get('timestamp'),
                    'message_id': message.get('id')
                }
        except Exception as e:
            print(f"Error parsing webhook data: {e}")
        
        return None
    
    def should_respond(self, sender_number: str) -> bool:
        """Check if we should respond to this sender (not the checker)"""
        return sender_number != self.ai_checker.checker_number.replace('+', '').replace(' ', '')
    
    def generate_ai_response(self, message_text: str, sender: str) -> str:
        """Generate AI response for franchise message"""
        if self.should_respond(sender):
            return self.ai_checker.generate_response(message_text)
        return None
    
    def send_whatsapp_message(self, to_number: str, message: str, access_token: str, phone_number_id: str) -> Dict:
        """Send message via WhatsApp Business API"""
        url = f"https://graph.facebook.com/v17.0/{phone_number_id}/messages"
        
        headers = {
            'Authorization': f'Bearer {access_token}',
            'Content-Type': 'application/json'
        }
        
        payload = {
            "messaging_product": "whatsapp",
            "to": to_number,
            "text": {
                "body": message
            }
        }
        
        try:
            response = requests.post(url, headers=headers, json=payload)
            return response.json()
        except Exception as e:
            print(f"Error sending WhatsApp message: {e}")
            return {"error": str(e)}

def create_flask_webhook_handler(ai_checker: TransactionCheckerAI):
    """Create Flask webhook handler for WhatsApp"""
    from flask import Flask, request, jsonify
    
    app = Flask(__name__)
    whatsapp_integration = WhatsAppIntegration(ai_checker)
    
    @app.route('/webhook', methods=['GET'])
    def verify_webhook():
        """Verify webhook for WhatsApp Business API"""
        mode = request.args.get('hub.mode')
        token = request.args.get('hub.verify_token')
        challenge = request.args.get('hub.challenge')
        
        if mode == 'subscribe' and token == whatsapp_integration.webhook_verify_token:
            return challenge
        else:
            return "Forbidden", 403
    
    @app.route('/webhook', methods=['POST'])
    def handle_webhook():
        """Handle incoming WhatsApp messages"""
        try:
            data = request.get_json()
            
            # Parse the message
            parsed_message = whatsapp_integration.parse_whatsapp_webhook(data)
            
            if parsed_message and parsed_message['text']:
                # Generate AI response
                ai_response = whatsapp_integration.generate_ai_response(
                    parsed_message['text'], 
                    parsed_message['from']
                )
                
                if ai_response:
                    # Here you would send the response back via WhatsApp API
                    # For now, just log it
                    print(f"Franchise: {parsed_message['text']}")
                    print(f"AI Response: {ai_response}")
                    
                    # Uncomment below to actually send response
                    # access_token = os.getenv('WHATSAPP_ACCESS_TOKEN')
                    # phone_number_id = os.getenv('WHATSAPP_PHONE_NUMBER_ID')
                    # whatsapp_integration.send_whatsapp_message(
                    #     parsed_message['from'], 
                    #     ai_response, 
                    #     access_token, 
                    #     phone_number_id
                    # )
            
            return jsonify({"status": "success"}), 200
            
        except Exception as e:
            print(f"Webhook error: {e}")
            return jsonify({"error": str(e)}), 500
    
    return app

def test_conversation_flow():
    """Test the conversation flow with sample data"""
    
    # Initialize AI checker
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        print("Please set GEMINI_API_KEY in .env file")
        return
    
    ai_checker = TransactionCheckerAI(api_key)
    
    # Sample WhatsApp conversation
    sample_messages = [
        "18/07/2025, 6:02 pm - +971 58 201 5216: iski slip send karen bhaiya @123867527934049",
        "18/07/2025, 6:03 pm - +1 (939) 545-9811: kar rhe ha sir",
        "18/07/2025, 6:28 pm - +971 58 201 5216: rec hai tu wait q karwa rahy hain? @143104535470092",
        "18/07/2025, 6:37 pm - +1 (939) 545-9811: sir es ki id show nhi ho rhi hmhre paas",
        "18/07/2025, 6:41 pm - +1 (939) 545-9811: karna hai depsit sir ?",
    ]
    
    print("\\n=== Conversation Flow Test ===\\n")
    
    processed = ai_checker.process_chat_conversation(sample_messages)
    
    for msg in processed:
        print(f"[{msg['timestamp']}] {msg['sender']}: {msg['message']}")
        if msg['ai_response']:
            print(f"[AI Response]: {msg['ai_response']}")
        print()

if __name__ == "__main__":
    test_conversation_flow()