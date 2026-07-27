// 1. Install OpenAI SDK if not installed
// npm install openai

import 'dotenv/config';
import OpenAI from "openai";

// 2. Use your API key from environment variable
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY  // safer than hardcoding
});

// 3. Test function
async function testOpenAI() {
  try {
    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      input: "Hello! This is a test. Is my OpenAI API key working?"
    });
    console.log("OpenAI Response:", response.output[0].content[0].text);
  } catch (error) {
    console.error("Error calling OpenAI:", error);
  }
}

// 4. Run test
testOpenAI();
