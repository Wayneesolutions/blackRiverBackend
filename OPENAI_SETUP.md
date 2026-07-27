# OpenAI API Setup Guide

This guide explains how to set up OpenAI API integration for automated payroll generation.

## Prerequisites

- OpenAI API account with API key
- Node.js backend environment

## Setup Instructions

### 1. Get OpenAI API Key

1. Go to [OpenAI Platform](https://platform.openai.com/)
2. Sign up or log in to your account
3. Navigate to API Keys section
4. Create a new API key
5. Copy the API key (it starts with `sk-`)

### 2. Add API Key to Environment Variables

Add the following to your `.env` file in the `logistiqbackend` directory:

```env
OPENAI_API_KEY=sk-your-api-key-here
```

**Important:** Never commit your API key to version control. Make sure `.env` is in your `.gitignore` file.

### 3. Install OpenAI Package (if needed)

The service uses `axios` which should already be installed. If you encounter issues, ensure axios is installed:

```bash
cd logistiqbackend
npm install axios
```

### 4. Verify Setup

The OpenAI service will automatically use the API key from environment variables. If the key is not set, you'll receive an error when trying to use automated payroll features.

## Features Using OpenAI

1. **Automated Payroll Generation** (`/hr/generate-payroll`)
   - Analyzes employee attendance
   - Calculates bonuses and deductions
   - Provides AI recommendations

2. **Monthly Salary Report** (`/hr/monthly-salary-report`)
   - Generates comprehensive monthly reports
   - Provides AI insights and recommendations
   - Includes attendance analysis

## API Usage

The OpenAI integration uses the `gpt-4o-mini` model by default, which is cost-effective and provides good results for payroll analysis.

### Cost Considerations

- The service uses structured prompts to minimize token usage
- Responses are limited to 2000 tokens by default
- Fallback calculations are provided if OpenAI API fails

## Troubleshooting

### Error: "OPENAI_API_KEY is not set"

**Solution:** Make sure you've added `OPENAI_API_KEY` to your `.env` file and restarted your server.

### Error: "OpenAI API Error"

**Possible causes:**
- Invalid API key
- Insufficient API credits
- Network connectivity issues

**Solution:** 
- Verify your API key is correct
- Check your OpenAI account balance
- Ensure your server has internet access

### Fallback Behavior

If OpenAI API fails, the system will:
- Use fallback calculations based on attendance data
- Still provide payroll recommendations
- Continue functioning without AI features

## Security Best Practices

1. **Never commit API keys** to version control
2. **Use environment variables** for sensitive data
3. **Rotate API keys** periodically
4. **Monitor API usage** to prevent unexpected costs
5. **Set usage limits** in OpenAI dashboard

## Testing

To test the integration:

1. Ensure `OPENAI_API_KEY` is set in `.env`
2. Start your backend server
3. Use the automated payroll generation feature
4. Check server logs for any errors

## Support

For issues related to:
- **OpenAI API**: Check [OpenAI Documentation](https://platform.openai.com/docs)
- **Integration**: Check server logs and error messages
- **Payroll calculations**: Verify attendance data is correct

