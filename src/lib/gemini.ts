import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ 
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  } 
});

export async function generateChatResponse(message: string, history: any[] = []) {
  try {
    // Interactions API pattern
    const interaction = await ai.interactions.create({
      model: "gemini-3.7-flash",
      input: message,
      system_instruction: `You are a professional B2B support agent for Bivaax Trader. 
      Provide concise, professional, and helpful responses.
      Always output your response in the following JSON format:
      {
        "reply": "Your professional response text here",
        "actions": ["Command 1", "Command 2", "Command 3"]
      }
      Ensure actions are short, actionable commands relevant to the context.`,
      // The SDK might handle JSON automatically or require specific config, 
      // based on instructions, I should ask for JSON format in system_instruction.
      // Interactions API generally returns structured content in steps.
    });

    // Helper to get text from interaction steps
    let fullOutput = "";
    for (const step of interaction.steps) {
      if (step.type === 'model_output') {
        const textContent = step.content?.find(c => c.type === 'text');
        if (textContent && textContent.text) {
          fullOutput += textContent.text;
        }
      }
    }

    // JSON extraction
    const jsonMatch = fullOutput.match(/```json\s*([\s\S]*?)\s*```/) || fullOutput.match(/([\{\[][\s\S]*[\}\]])/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1]);
      } catch (err) {
        console.error("Failed to parse JSON response:", err);
      }
    }
    
    // Fallback if JSON parsing fails
    return { reply: fullOutput, actions: [] };
  } catch (error) {
    console.error("Error generating chat response:", error);
    return { reply: "দুঃখিত, বর্তমানে এআই সেবাটি পাওয়া যাচ্ছে না। দয়া করে কিছুক্ষণ পর আবার চেষ্টা করুন।", actions: [] };
  }
}
