# WhatsApp Transaction Checker AI Bot

This project automates WhatsApp group communication for transaction checking using AI to replace human checkers.

## Features

- **Message Classification**: Automatically categorizes franchise responses into different scenarios
- **Contextual AI Responses**: Generates appropriate responses in Hinglish based on context
- **Scenario Management**: Handles common transaction scenarios like slip requests, approvals, delays
- **Gemini Integration**: Uses Google's Gemini Pro for natural language understanding

## Project Structure

```
checkers/
├── ai_checker_bot.py           # Main AI bot implementation
├── transaction_scenarios.json   # Predefined scenarios and response templates
├── whatsapp_chat_data.txt      # Sample chat data for training/testing
├── requirements.txt            # Python dependencies
├── .env.example               # Environment variables template
└── README.md                  # This file
```

## Setup Instructions

1. **Install Dependencies**
   ```bash
   pip install -r requirements.txt
   ```

2. **Get Gemini API Key**
   - Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
   - Create a new API key
   - Copy the API key

3. **Configure Environment**
   ```bash
   cp .env.example .env
   # Edit .env and add your GEMINI_API_KEY
   ```

4. **Run the Bot**
   ```bash
   python ai_checker_bot.py
   ```

## How It Works

### 1. Message Processing
- Parses WhatsApp message format with timestamps and phone numbers
- Identifies checker messages using the specific number: `+971 58 201 5216`
- Extracts franchise responses for AI processing

### 2. Scenario Classification
The AI categorizes messages into these scenarios:
- **slip_request**: Requesting payment slips
- **transaction_check**: Checking payment status
- **bank_details_request**: Asking for bank details
- **approval_request**: Transaction approvals
- **time_delay_complaint**: Handling delays
- **id_verification**: ID checking
- **other**: Unrelated messages

### 3. Response Generation
- Uses context from previous messages
- Generates Hinglish responses matching human checker style
- Maintains urgency and authority in communication

## Sample Interactions

```
Franchise: "Bank server down hai sir, thoda time lagega"
AI Checker: "Koi baat nhi, alternative bank use karo. Customer wait kar raha hai."

Franchise: "kar rhe ha sir"
AI Checker: "Jaldi karo, time limit hai."

Franchise: "not rec abhi tak"
AI Checker: "UTR properly check karo. Bank se confirm karo agar sab theek hai."
```

## Extending the System

### Adding New Scenarios
Edit `transaction_scenarios.json` to add new scenarios:

```json
{
  "new_scenario": {
    "description": "Description of the scenario",
    "checker_messages": ["example checker message"],
    "franchise_responses": [
      {
        "type": "response_type",
        "examples": ["example response"],
        "ai_followup": "AI response template"
      }
    ]
  }
}
```

### Customizing AI Responses
Modify the response templates in `ai_response_templates` section of the JSON file.

### Adding More Chat Data
Append new WhatsApp conversations to `whatsapp_chat_data.txt` to improve AI training context.

## Integration Options

### WhatsApp Business API Integration
- Use WhatsApp Business API to connect the bot directly to WhatsApp
- Implement webhook endpoints to receive and send messages

### Database Integration
- Store conversations for analytics and improvement
- Track response accuracy and user satisfaction

### Dashboard Integration
- Build a web dashboard to monitor bot performance
- Allow manual override when needed

## Security Considerations

- Store API keys securely using environment variables
- Implement rate limiting for API calls
- Add authentication for bot control endpoints
- Regularly rotate API keys

## Future Enhancements

1. **Multi-language Support**: Support for other regional languages
2. **Learning System**: Improve responses based on feedback
3. **Integration with Banking APIs**: Real-time transaction verification
4. **Analytics Dashboard**: Performance monitoring and insights
5. **Voice Message Support**: Handle voice messages from franchises

## Troubleshooting

### Common Issues
1. **API Key Error**: Ensure GEMINI_API_KEY is set correctly in .env
2. **Message Parsing Issues**: Check WhatsApp export format matches expected pattern
3. **Response Quality**: Add more training data to improve AI responses

### Support
For issues and improvements, contact the development team or check the project documentation.