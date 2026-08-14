import { GoogleGenAI, Type, FunctionDeclaration } from "@google/genai";
import { get, query } from "../db/mysql-db.ts";

const GEMINI_API_KEY = "AQ.Ab8RN6KFiSO65DCEo_A8KrqfdZqPtZhR-3BziLaOuhxnK0uMwg";

const ai = new GoogleGenAI({ 
  apiKey: GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  } 
});

const tools: FunctionDeclaration[] = [
  {
    name: "getUserProfile",
    description: "Fetch the user's profile details including verification status, balances, and personal info.",
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
  {
    name: "getUserTransactions",
    description: "Get transaction history (deposits, withdrawals) and summary counts for the user.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        type: {
          type: Type.STRING,
          description: "Optional filter for transaction type: 'deposit' or 'withdrawal'.",
          enum: ["deposit", "withdrawal"],
        },
      },
    },
  },
  {
    name: "getTradeHistory",
    description: "Get the user's recent trade history and performance statistics.",
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
];

async function callTool(name: string, args: any, userId: string) {
  switch (name) {
    case "getUserProfile":
      return await get('SELECT uid, email, display_name, real_balance, demo_balance, is_verified, kyc_status, country, phone, created_at FROM users WHERE uid = ?', [userId]);
    case "getUserTransactions":
      const txs = await query('SELECT type, amount, status, method, tx_hash, created_at FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 10', [userId]);
      const summary = await query('SELECT type, status, COUNT(*) as count, SUM(amount) as total FROM transactions WHERE user_id = ? GROUP BY type, status', [userId]);
      return { transactions: txs, summary };
    case "getTradeHistory":
      const trades = await query('SELECT asset, amount, direction, entry_price, exit_price, status, payout_amount, created_at FROM trades WHERE user_id = ? ORDER BY created_at DESC LIMIT 10', [userId]);
      const stats = await get('SELECT COUNT(*) as total, SUM(CASE WHEN status = "won" THEN 1 ELSE 0 END) as won, SUM(amount) as total_volume FROM trades WHERE user_id = ?', [userId]);
      return { trades, stats };
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

async function generateContentWithFallback(params: { contents: any[]; config: any }) {
  const modelsToTry = ["gemini-3.7-flash", "gemini-3.1-flash-lite"];
  let lastError: any = null;
  for (const model of modelsToTry) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: params.contents,
        config: params.config,
      });
      return response;
    } catch (err: any) {
      console.warn(`⚠️ Model ${model} failed or is overloaded, trying fallback. Error:`, err.message || err);
      lastError = err;
    }
  }
  throw lastError;
}

export async function generateChatResponse(message: string, history: any[] = [], userId?: string) {
  try {
    const contents = [...history, { role: 'user', parts: [{ text: message }] }];
    
    let response = await generateContentWithFallback({
      contents,
      config: {
        systemInstruction: `You are a professional B2B Support Agent for Bivaax Trader. 
        You have access to tools to check user data (profile, transactions, trades). 
        Always provide professional, helpful, and concise responses.
        If the user asks about their account, balances, or transactions, use the tools.
        If you provide transaction or profile data, format it in a clean markdown table.
        
        CRITICAL: Always output your final response in this JSON format:
        {
          "reply": "Your professional response text (include markdown tables for data)",
          "actions": ["Command 1", "Command 2", "Command 3"]
        }
        
        Ensure actions are short, actionable commands relevant to the context.`,
        tools: [{ functionDeclarations: tools }],
      },
    });

    // Handle function calls
    let iterations = 0;
    while (response.functionCalls && iterations < 5) {
      iterations++;
      const toolResponses = [];
      for (const call of response.functionCalls) {
        if (!userId) {
          toolResponses.push({
            name: call.name,
            id: call.id,
            response: { error: "User not authenticated. Please log in to check account details." }
          });
          continue;
        }
        const result = await callTool(call.name, call.args, userId);
        toolResponses.push({
          name: call.name,
          id: call.id,
          response: { result }
        });
      }

      // Add the model's tool calls and our responses to the conversation
      contents.push({ role: 'model', parts: response.candidates[0].content.parts });
      contents.push({ role: 'user', parts: toolResponses.map(tr => ({ functionResponse: tr })) });

      response = await generateContentWithFallback({
        contents,
        config: {
          systemInstruction: `Continue providing the professional response in JSON format.`,
          tools: [{ functionDeclarations: tools }],
        },
      });
    }

    const fullOutput = response.text || "";
    
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
    return { reply: fullOutput, actions: ["How to begin? 🤔", "Support Dashboard", "Contact Agent"] };
  } catch (error) {
    console.error("Error generating chat response:", error);
    return { reply: "দুঃখিত, বর্তমানে এআই সেবাটি পাওয়া যাচ্ছে না। দয়া করে কিছুক্ষণ পর আবার চেষ্টা করুন।", actions: ["Try again", "Support Center"] };
  }
}
