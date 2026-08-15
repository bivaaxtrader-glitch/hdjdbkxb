import { GoogleGenAI, Type, FunctionDeclaration } from '@google/genai';
import { get, query } from '../db/mysql-db.ts';
import logger from '../lib/logger.ts';

// Model selection: Use gemini-2.5-flash with fallback to gemini-1.5-flash
const MODELS_TO_TRY = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];

let aiClient: GoogleGenAI | null = null;

function getGeminiClient() {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      logger.error('GEMINI_API_KEY environment variable is missing');
      return null;
    }
    aiClient = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiClient;
}

// --- Function Declarations ---

const getUserProfileDeclaration: FunctionDeclaration = {
  name: 'get_user_profile',
  description: 'Get the user profile including balances, KYC status, and verification status.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      uid: { type: Type.STRING, description: 'The unique user ID' }
    },
    required: ['uid']
  }
};

const getRecentTransactionsDeclaration: FunctionDeclaration = {
  name: 'get_recent_transactions',
  description: 'Get the user recent transactions (deposits and withdrawals).',
  parameters: {
    type: Type.OBJECT,
    properties: {
      uid: { type: Type.STRING, description: 'The unique user ID' },
      limit: { type: Type.NUMBER, description: 'Number of transactions to return (default 5)' }
    },
    required: ['uid']
  }
};

const getRecentTradesDeclaration: FunctionDeclaration = {
  name: 'get_recent_trades',
  description: 'Get the user recent trade history.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      uid: { type: Type.STRING, description: 'The unique user ID' },
      limit: { type: Type.NUMBER, description: 'Number of trades to return (default 5)' }
    },
    required: ['uid']
  }
};

const getKYCDetailsDeclaration: FunctionDeclaration = {
  name: 'get_kyc_details',
  description: 'Get detailed information about the user KYC request status and history.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      uid: { type: Type.STRING, description: 'The unique user ID' }
    },
    required: ['uid']
  }
};

const searchDocsDeclaration: FunctionDeclaration = {
  name: 'search_docs',
  description: 'Search the platform documentation for specific rules, terms, or help topics.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: { type: Type.STRING, description: 'The search query or topic' }
    },
    required: ['query']
  }
};

// --- Function Implementations ---

const PLATFORM_DOCS = [
    { title: "Deposit Rules", content: "Min deposit: $10 / 1000 BDT. Methods: bKash, Nagad, Rocket, Binance Pay, USDT, VISA/MC. Processing: Instant to 30 mins." },
    { title: "Withdrawal Rules", content: "Min withdrawal: $10. Time: 1-24 hours. Must use same method as deposit where possible. KYC required." },
    { title: "KYC Verification Process", content: "To verify your account: 1. Go to Profile -> Verification. 2. Upload your ID card (Front & Back) or Passport. 3. Upload a clear selfie holding your ID. 4. Wait for approval (usually < 30 mins). KYC is MANDATORY for all withdrawals." },
    { title: "Email Verification", content: "Email verification is required for account security. You should receive a verification link upon signup. If not, you can resend it from Profile settings." },
    { title: "Trading Mechanics", content: "Binary Options OTC. Expiry: 1 min to 4 hours. Payout: Up to 98%. Profit is paid immediately upon win." },
    { title: "Affiliate Program", content: "RevShare up to 80%. Multi-level referral system. Payouts processed weekly." },
    { title: "Account Safety", content: "2FA is highly recommended. Never share your password or OTP. Support will never ask for your password." }
];

async function search_docs(queryStr: string) {
    const q = queryStr.toLowerCase();
    const matches = PLATFORM_DOCS.filter(doc => 
        doc.title.toLowerCase().includes(q) || doc.content.toLowerCase().includes(q)
    );
    if (matches.length > 0) return { matches };
    return { error: 'No specific documentation found for this topic. Please check General FAQ.' };
}

async function get_user_profile(uid: string) {
  try {
    const user = await get('SELECT display_name, email, real_balance, demo_balance, kyc_status, is_verified, currency FROM users WHERE uid = ?', [uid]) as any;
    if (!user) return { error: 'User not found' };
    return user;
  } catch (err: any) {
    return { error: err.message };
  }
}

async function get_kyc_details(uid: string) {
  try {
    const kyc = await get('SELECT status, rejection_reason, created_at, updated_at FROM kyc_requests WHERE user_id = ? ORDER BY created_at DESC LIMIT 1', [uid]) as any;
    if (!kyc) return { status: 'none', message: 'User has not submitted a KYC request yet.' };
    return kyc;
  } catch (err: any) {
    return { error: err.message };
  }
}

async function get_recent_transactions(uid: string, limit: number = 5) {
  try {
    const txs = await query('SELECT type, amount, status, method, currency, created_at FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT ?', [uid, limit]);
    return { transactions: txs };
  } catch (err: any) {
    return { error: err.message };
  }
}

async function get_recent_trades(uid: string, limit: number = 5) {
  try {
    const trades = await query('SELECT asset, amount, direction, entry_price, exit_price, status, payout_amount, created_at FROM trades WHERE user_id = ? ORDER BY created_at DESC LIMIT ?', [uid, limit]);
    return { trades };
  } catch (err: any) {
    return { error: err.message };
  }
}

// --- Main Agent Logic ---

export async function handleSupportQuery(uid: string, message: string, history: any[] = [], mode: 'standard' | 'agentic' = 'agentic') {
  const client = getGeminiClient();
  if (!client) throw new Error('AI Client not available');

  const isAgentic = mode === 'agentic';

  const systemInstruction = isAgentic 
    ? `You are "Bivaax Agentic AI Specialist", a highly capable 24/7 AI agent for Bivaax Trade.
  Your goal is to provide comprehensive help to users regarding their account and the platform.
  
  CORE CAPABILITIES (Use tools for these):
  - Check User Balances (Real & Demo)
  - Verify Email Verification Status (is_verified)
  - Check KYC Verification Status (kyc_status & kyc_details)
  - Review Recent Transactions (Deposits & Withdrawals)
  - Review Recent Trade History
  - Search Platform Documentation (Rules, KYC Process, Deposits)

  Email Verification (is_verified):
  - If is_verified is true, the user's email is verified.
  - If false, inform them how to verify.

  KYC Verification (kyc_status):
  - Possible statuses: 'unverified', 'pending', 'verified', 'rejected'.
  - If rejected, use get_kyc_details to find the reason and tell the user.
  - If unverified, explain the KYC process clearly using search_docs('KYC').

  Guidelines:
  1. Be professional, helpful, and concise.
  2. Answer in the user's language (English or Bangla).
  3. You have FULL PERMISSION to read user account details, verification status, and transaction history to assist them.
  4. Always use JSON format for your final response:
     {
       "reply": "your text response",
       "transferToAgent": boolean,
       "suggestedCategory": "Deposit" | "Withdrawal" | "Trading" | "Verification" | "Account"
     }`
    : `You are "Bivaax Support Chatbot", a helpful assistant for Bivaax Trade. 
    Provide general help about the platform. You do NOT have access to real-time user data or specific account details in this mode.
    If the user asks for account-specific info, advise them to switch to "Agentic Mode" or contact a human agent.
    Always return JSON: { "reply": string, "transferToAgent": boolean }`;

  const tools = isAgentic ? [
    { functionDeclarations: [getUserProfileDeclaration, getRecentTransactionsDeclaration, getRecentTradesDeclaration, searchDocsDeclaration, getKYCDetailsDeclaration] }
  ] : [];

  try {
    let response: any = null;
    let lastErr: any = null;

    for (const mName of MODELS_TO_TRY) {
      try {
        response = await client.models.generateContent({
          model: mName,
          contents: message,
          config: {
            systemInstruction,
            tools: tools.length > 0 ? tools : undefined,
            toolConfig: isAgentic ? { includeServerSideToolInvocations: true } : undefined,
            responseMimeType: 'application/json'
          }
        });
        break;
      } catch (mErr: any) {
        lastErr = mErr;
        logger.warn(`Model ${mName} failed in support agent: ${mErr.message}`);
      }
    }

    if (!response && lastErr) throw lastErr;
    let currentResponse = response;
    
    // 2. Handle Tool Calls if any (only in agentic mode)
    const functionCalls = currentResponse.functionCalls;
    if (isAgentic && functionCalls && functionCalls.length > 0) {
        const toolResults = [];
        for (const call of functionCalls) {
            let resultData;
            if (call.name === 'get_user_profile') {
                resultData = await get_user_profile(uid);
            } else if (call.name === 'get_recent_transactions') {
                resultData = await get_recent_transactions(uid, (call.args as any).limit);
            } else if (call.name === 'get_recent_trades') {
                resultData = await get_recent_trades(uid, (call.args as any).limit);
            } else if (call.name === 'search_docs') {
                resultData = await search_docs((call.args as any).query);
            } else if (call.name === 'get_kyc_details') {
                resultData = await get_kyc_details(uid);
            }
            
            toolResults.push({
                callId: call.id,
                response: { result: resultData }
            });
        }

        // Send results back to model with fallback
        let secondResponse: any = null;
        for (const mName of MODELS_TO_TRY) {
          try {
            secondResponse = await client.models.generateContent({
                model: mName,
                contents: [
                    { role: 'user', parts: [{ text: message }] },
                    { role: 'model', parts: currentResponse.candidates?.[0]?.content?.parts },
                    { role: 'user', parts: toolResults.map(tr => ({
                        functionResponse: {
                            name: functionCalls.find(fc => fc.id === tr.callId)?.name || '',
                            response: tr.response
                        }
                    })) }
                ],
                config: {
                    systemInstruction,
                    responseMimeType: 'application/json'
                }
            });
            break;
          } catch (e) {}
        }
        if (secondResponse) {
          currentResponse = secondResponse;
        }
    }

    const rawText = currentResponse.text || '{}';
    const jsonMatch = rawText.match(/```json\s*([\s\S]*?)\s*```/) || rawText.match(/([\{\[][\s\S]*[\}\]])/);
    const finalJson = jsonMatch ? JSON.parse(jsonMatch[1]) : { reply: rawText, transferToAgent: false };
    return finalJson;

  } catch (err: any) {
    logger.error(`Support Agent Error: ${err.message}`);
    return {
      reply: "দুঃখিত, বর্তমানে এআই সাপোর্ট সার্ভারে অতিরিক্ত ট্রাফিকের কারণে রিকোয়েস্ট প্রসেস করা যাচ্ছে না। অনুগ্রহ করে কিছুক্ষণ পর আবার চেষ্টা করুন অথবা সরাসরি লাইভ সাপোর্টে যোগাযোগ করুন।",
      transferToAgent: true,
      suggestedCategory: "Technical Issue"
    };
  }
}
