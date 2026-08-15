import express, { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db, get, query, run, transaction } from '../db/mysql-db.ts';
import { requireAuth, AuthRequest } from '../middleware/jwtAuth.ts';
import { createAuditLog } from '../lib/audit.ts';
import logger from '../lib/logger.ts';
import { getIO } from '../services/socketService.ts';
import Big from 'big.js';
import { mapUserForFrontend } from '../lib/user-utils.ts';
import { GoogleGenAI, Type } from '@google/genai';
import { adminDb, syncUserToFirestore } from '../lib/firebase-admin.ts';
import { sendEmail } from '../lib/email.ts';
import { generateChatResponse } from '../lib/gemini.ts';

import { handleSupportQuery } from './support-agent.ts';
import { body, validationResult } from 'express-validator';

import { 
  markets_real, markets_demo, 
  systemActive, globalManipulationMode,
  setSystemActive, setGlobalManipulationMode,
  setUserManipulation,
  isMarketClosedAt
} from '../services/marketService.ts';

const router = express.Router();

// --- Market News ---
router.get('/news', async (req, res) => {
  try {
    if (req.query.type === 'collection') {
      const snapshot = await adminDb.collection('news').get();
      const docs: any[] = [];
      snapshot.forEach((doc: any) => docs.push({ id: doc.id, ...doc.data() }));
      return res.json(docs);
    }
    // Return news as expected by NewsWidget and TradeTerminal
    res.json({
      news: [
        "Bitcoin surpasses $60,000 as institutional demand grows.",
        "Global markets rally as inflation data shows cooling trends.",
        "Gold hits record high amid geopolitical uncertainty.",
        "Central Bank hints at potential rate cuts by year-end.",
        "Tech sector leads gains in pre-market trading session."
      ],
      Data: [] // For compatibility with older news widget versions
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- Market State ---
router.get('/market/state', (req, res) => {
  res.json({
    systemActive,
    globalManipulationMode,
    markets: markets_real
  });
});

router.post('/admin/system/toggle', (req, res) => {
  const { active } = req.body;
  setSystemActive(!!active);
  getIO().emit('system_status', !!active);
  res.json({ success: true, active: !!active });
});

router.post('/admin/test-email', async (req, res) => {
  const { email, config } = req.body;
  
  if (!email || !config) {
    return res.status(400).json({ error: 'Missing email or config' });
  }

  try {
    // 1. Manually update the settings in Firestore temporarily or just pass them to a modified sendEmail
    // For simplicity, we'll try to send using the provided config immediately
    const success = await sendEmail(
      email, 
      'Bivaax Trade - Connection Test', 
      `
        <div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 10px; background-color: #f9f9f9;">
          <h2 style="color: #4CAF50;">Success!</h2>
          <p>Your email integration is working correctly.</p>
          <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="font-size: 12px; color: #666;">
            <strong>Method:</strong> ${config.resendApiKey ? 'Resend.com API' : 'SMTP Relay'}<br>
            <strong>Target:</strong> ${email}
          </p>
        </div>
      `,
      'Your Bivaax Trade email integration is working correctly.'
    );

    if (success) {
      res.json({ success: true });
    } else {
      res.status(500).json({ success: false, error: 'Email sending failed. Check server logs.' });
    }
  } catch (err: any) {
    console.error('Email Test Error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/admin/manipulation/global', (req, res) => {
  const { mode } = req.body;
  setGlobalManipulationMode(mode);
  getIO().emit('global_manipulation_status', mode);
  res.json({ success: true, mode });
});

router.post('/admin/market/update', (req, res) => {
  const { pair, triggerNews, ...updates } = req.body;
  
  if (markets_real[pair]) {
    markets_real[pair] = { ...markets_real[pair], ...updates };
    // Persist hidden status
    if ('hidden' in updates) {
      run('INSERT OR REPLACE INTO market_settings (pair, hidden) VALUES (?, ?)', [pair, updates.hidden ? 1 : 0]);
    }
  }
  if (markets_demo[pair]) {
    markets_demo[pair] = { ...markets_demo[pair], ...updates };
  }

  if (triggerNews) {
    // We can't directly access otcEngine's internal state, 
    // but we can set a flag in marketService for otcEngine to pick up.
    // However, it's easier to just pass the news info through markets object if needed.
    // Let's add a newsTrigger field to the market object.
    markets_real[pair].newsTrigger = {
      intensity: 5 + Math.random() * 5,
      duration: 10000 + Math.random() * 10000,
      direction: Math.random() > 0.5 ? 1 : -1
    };
    markets_demo[pair].newsTrigger = markets_real[pair].newsTrigger;
  }

  getIO().emit('market_settings_updated', markets_real);
  res.json({ success: true });
});

router.post('/affiliate/next-id', async (req, res) => {
    try {
        let nextId = 10001;
        const row = await get('SELECT MAX(CAST(referral_code AS INTEGER)) as maxId FROM users') as any;
        if (row && row.maxId && row.maxId >= 10000) {
            nextId = parseInt(row.maxId) + 1;
        }
        res.json({ nextId });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});


// Lazy-initialized Gemini Client
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

// Data Mapping Helpers to bridge CamelCase and snake_case
function mapTrade(t: any) {
  if (!t) return null;
  const expiryTimeMs = t.expiry_time ? t.expiry_time * 1000 : Date.now() + (t.duration || 60) * 1000;
  return {
    ...t,
    id: t.id,
    userId: t.user_id,
    user_id: t.user_id,
    marketId: t.market_id,
    market_id: t.market_id,
    asset: t.asset || t.market_id,
    amount: parseFloat(t.amount || 0),
    direction: t.direction,
    type: t.type || t.direction,
    entryPrice: parseFloat(t.entry_price || 0),
    entry_price: t.entry_price,
    exitPrice: t.exit_price ? parseFloat(t.exit_price) : null,
    exit_price: t.exit_price,
    duration: t.duration,
    timeLeft: t.time_left,
    time_left: t.time_left,
    expiryTime: t.expiry_time,
    expiry_time: t.expiry_time,
    expirationTime: t.expiration_time ? (isNaN(Number(t.expiration_time)) ? new Date(t.expiration_time).getTime() : Number(t.expiration_time)) : expiryTimeMs,
    expiration_time: t.expiration_time,
    isDemo: !!t.is_demo,
    is_demo: !!t.is_demo,
    accountType: t.account_type || (t.is_demo ? 'demo' : 'real'),
    account_type: t.account_type || (t.is_demo ? 'demo' : 'real'),
    status: t.status,
    payoutAmount: t.payout_amount ? parseFloat(t.payout_amount) : null,
    payout_amount: t.payout_amount,
    payout: t.payout,
    settledAt: t.settled_at,
    settled_at: t.settled_at,
    createdAt: t.created_at,
    created_at: t.created_at,
    updatedAt: t.updated_at,
    updated_at: t.updated_at,
  };
}

function mapTicket(t: any) {
  if (!t) return null;
  return {
    ...t,
    id: t.id,
    userId: t.user_id,
    user_id: t.user_id,
    userName: t.user_name || 'User',
    userEmail: t.user_email || 'trader@Bivaax.trade',
    subject: t.subject,
    category: t.category || 'General',
    message: t.message,
    lastMessage: t.last_message,
    last_message: t.last_message,
    status: t.status || 'open',
    priority: t.priority || 'medium',
    assignedAgentId: t.assigned_agent_id,
    assignedAgentName: t.assigned_agent_name,
    assignedAgentEmail: t.assigned_agent_email,
    channel: t.channel || 'chat',
    rating: t.rating,
    ratingFeedback: t.rating_feedback,
    isAiHandled: t.is_ai_handled !== undefined ? Boolean(t.is_ai_handled) : true,
    closedAt: t.closed_at,
    firstResponseAt: t.first_response_at,
    resolvedAt: t.resolved_at,
    updatedAt: t.updated_at,
    updated_at: t.updated_at,
    createdAt: t.created_at,
    created_at: t.created_at,
  };
}

function mapMessage(m: any) {
  if (!m) return null;
  let parsedAttachments = [];
  try {
    if (m.attachments) {
      parsedAttachments = typeof m.attachments === 'string' ? JSON.parse(m.attachments) : m.attachments;
    }
  } catch (e) {
    parsedAttachments = [];
  }

  return {
    ...m,
    id: m.id,
    ticketId: m.ticket_id,
    ticket_id: m.ticket_id,
    userId: m.user_id,
    user_id: m.user_id,
    senderType: m.sender_type || (m.isAdmin || m.is_admin ? 'agent' : 'user'),
    senderName: m.sender_name || (m.isAdmin || m.is_admin ? 'Support Agent' : 'User'),
    text: m.message,
    message: m.message,
    attachments: parsedAttachments,
    isInternalNote: Boolean(m.is_internal_note),
    isRead: Boolean(m.is_read),
    status: m.is_read ? 'seen' : 'delivered',
    isAdmin: Boolean(m.isAdmin || m.is_admin),
    createdAt: m.created_at,
    created_at: m.created_at,
  };
}

// Helper function to resolve IP address to country
async function getCountryFromIp(ip: string): Promise<{ countryName: string; countryCode: string }> {
  // Safe defaults for localhost or private IPs
  if (
    !ip ||
    ip === '::1' ||
    ip === '127.0.0.1' ||
    ip === '::ffff:127.0.0.1' ||
    ip.startsWith('10.') ||
    ip.startsWith('192.168.') ||
    ip.startsWith('172.16.') ||
    ip.startsWith('172.17.') ||
    ip.startsWith('172.18.') ||
    ip.startsWith('172.19.') ||
    ip.startsWith('172.2') ||
    ip.startsWith('172.3')
  ) {
    return { countryName: 'Bangladesh', countryCode: 'BD' };
  }

  try {
    // Attempt 1: ip-api.com
    const response = await fetch(`http://ip-api.com/json/${ip}`, { signal: AbortSignal.timeout(3000) });
    if (response.ok) {
      const data = await response.json() as any;
      if (data && data.status === 'success') {
        return { countryName: data.country, countryCode: data.countryCode };
      }
    }
  } catch (err) {
    logger.error(`getCountryFromIp error (ip-api): ${err}`);
  }

  try {
    // Attempt 2: geojs.io
    const response = await fetch(`https://get.geojs.io/v1/ip/geo/${ip}.json`, { signal: AbortSignal.timeout(3000) });
    if (response.ok) {
      const data = await response.json() as any;
      if (data && data.country) {
        return { countryName: data.country, countryCode: data.country_code };
      }
    }
  } catch (err) {
    logger.error(`getCountryFromIp error (geojs): ${err}`);
  }

  return { countryName: 'Bangladesh', countryCode: 'BD' };
}

// IP Lookup endpoint (proxied for safety and to avoid mixed content warnings)
router.get('/ip-info', async (req, res) => {
  let ip = req.ip || '';
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const parts = (typeof forwarded === 'string' ? forwarded : forwarded[0]).split(',');
    ip = parts[0].trim();
  }

  const { countryName, countryCode } = await getCountryFromIp(ip);
  res.json({
    ip,
    country_code: countryCode,
    country_name: countryName
  });
});


// Add this route for AI chat proxying
router.post('/ai/chat', requireAuth, async (req: AuthRequest, res: Response) => {
  const { message, history } = req.body;
  if (!message) return res.status(400).json({ error: 'Message is required' });
  
  const replyData = await generateChatResponse(message, history, req.user?.uid);
  res.json({ reply: replyData });
});


// Auth Routes (Custom)
router.post('/auth/register', async (req, res) => {
  const { email, password, fullName, country, countryCode, referralCode, referralSubId, referralType } = req.body;
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

  if (!email || !password || !fullName) {
    return res.status(400).json({ error: 'Email, password and name are required' });
  }

  try {
    const existing = await get('SELECT * FROM users WHERE email = ?', [email]);
    if (existing) return res.status(400).json({ error: 'Email already registered' });

    const passwordHash = await bcrypt.hash(password, 10);
    const uid = 'user_' + Math.random().toString(36).substring(2, 15);
    const affiliateId = Math.random().toString(36).substring(2, 8).toUpperCase();
    
    let cName = country;
    let cCode = countryCode;
    
    if (!cName || !cCode) {
      const geo = await getCountryFromIp(ip as string);
      cName = cName || geo.countryName;
      cCode = cCode || geo.countryCode;
    }

    let referredBy = null;
    if (referralCode) {
      const referrer = await get('SELECT uid FROM users WHERE referral_code = ? OR uid = ?', [referralCode, referralCode]);
      if (referrer) {
        referredBy = (referrer as any).uid;
      }
    }

    await run(
      `INSERT INTO users (uid, email, password_hash, display_name, nickname, referral_code, country, country_code, referred_by_uid, referral_sub_id, referral_type) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [uid, email, passwordHash, fullName, fullName.split(' ')[0], affiliateId, cName, cCode, referredBy, referralSubId || null, referralType || null]
    );

    if (referredBy) {
      await run('UPDATE users SET referral_count = referral_count + 1 WHERE uid = ?', [referredBy]);
      // Sync referrer to Firestore immediately to persist count
      const updatedReferrer = await get('SELECT * FROM users WHERE uid = ?', [referredBy]);
      if (updatedReferrer) {
        syncUserToFirestore(referredBy, mapUserForFrontend(updatedReferrer));
      }
    }

    const user = await get('SELECT * FROM users WHERE uid = ?', [uid]) as any;

    // Send Welcome Email
    try {
      const subject = 'Welcome to Bivaax Trade - Professional Global Trading';
      const welcomeLink = `${req.headers.origin || 'https://bivaax.com'}/trade`;
      const html = `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-w: 600px; margin: 0 auto; background-color: #f4f7f9; padding: 20px;">
          <div style="background-color: #1a1b23; padding: 40px; border-radius: 12px 12px 0 0; color: white; text-align: center;">
            <h1 style="margin: 0; font-size: 28px; color: #FFE24C;">Welcome to Bivaax!</h1>
            <p style="opacity: 0.9; margin-top: 10px;">Your Professional Trading Journey Starts Here</p>
          </div>
          <div style="padding: 40px; background-color: white; border-radius: 0 0 12px 12px; border: 1px solid #e1e8ed; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
            <p style="font-size: 16px; color: #333;">Hello <strong>${fullName || 'Trader'}</strong>,</p>
            <p style="font-size: 16px; color: #333; line-height: 1.6;">Thank you for choosing Bivaax Trade. We are excited to have you on board as we redefine global trading with precision and transparency.</p>
            
            <div style="background-color: #f8fafc; border-radius: 12px; padding: 25px; margin: 30px 0; border-left: 4px solid #FFE24C;">
              <h3 style="margin: 0 0 15px 0; color: #1e293b; font-size: 14px; text-transform: uppercase; tracking-wider;">Your Account Details:</h3>
              <p style="margin: 5px 0; font-size: 15px; color: #475569;"><strong>Email:</strong> ${email}</p>
              <p style="margin: 5px 0; font-size: 15px; color: #475569;"><strong>Affiliate Code:</strong> ${affiliateId}</p>
            </div>

            <div style="text-align: center; margin: 35px 0;">
              <a href="${welcomeLink}" style="background-color: #FFE24C; color: #1a1b23; padding: 16px 40px; text-decoration: none; border-radius: 12px; font-weight: 800; font-size: 15px; text-transform: uppercase; display: inline-block; box-shadow: 0 4px 15px rgba(255, 226, 76, 0.3);">Access Trading Terminal</a>
            </div>

            <p style="font-size: 14px; color: #64748b; line-height: 1.6; text-align: center;">Need assistance? Our professional support team is available 24/7 to guide you through your first trades.</p>
            
            <hr style="border: 0; border-top: 1px solid #edf2f7; margin: 30px 0;">
            <div style="text-align: center; font-size: 12px; color: #94a3b8;">
              <p>&copy; 2026 Bivaax Trade Ecosystem. All Rights Reserved.</p>
              <p>Professional | Secure | Global</p>
            </div>
          </div>
        </div>
      `;
      await sendEmail(email, subject, html);
    } catch (mailErr) {
      logger.error('Failed to send registration welcome email:', mailErr);
    }

    res.json({ success: true, user });
    
    // Sync to Firestore for real-time data accessibility
    try {
      syncUserToFirestore(uid, mapUserForFrontend(user));
    } catch (syncErr) {
      logger.error('Failed to sync new user to Firestore:', syncErr);
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

  try {
    const user = await get('SELECT * FROM users WHERE email = ?', [email]) as any;
    if (!user || !user.password_hash) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: 'Invalid credentials' });

    // Sync to Firestore on login to ensure latest data is available real-time
    try {
      syncUserToFirestore(user.uid, mapUserForFrontend(user));
    } catch (syncErr) {
      logger.error('Failed to sync user to Firestore on login:', syncErr);
    }

    res.json({ success: true, user });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/kyc', async (req, res) => {
  const { userId, kycData } = req.body;
  if (!userId || !kycData) return res.status(400).json({ error: 'Missing KYC data' });

  try {
    // 1. Log the submission
    logger.info(`KYC Submission for ${userId}: ${kycData.fullName}`);

    // 2. Perform "Auto-Verification" Logic
    // In a real professional app, this would use OCR (like Google Vision API)
    // Here we simulate immediate rejection for suspicious data
    let status = 'pending';
    let rejectionReason = null;

    if (kycData.idNumber && kycData.idNumber.length < 5) {
      status = 'rejected';
      rejectionReason = 'Invalid ID number format. Document rejected.';
    }

    // 3. Update SQL database
    await run(
      'UPDATE users SET kyc_status = ?, updated_at = ? WHERE uid = ?',
      [status, Date.now(), userId]
    );

    try {
      await run(
        `INSERT INTO kyc_requests (user_id, status, full_name, document_type, document_number, front_image, back_image, selfie_image, rejection_reason, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          userId, 
          status, 
          kycData.fullName || '', 
          kycData.idType || '', 
          kycData.idNumber || '', 
          kycData.idFrontUrl || '', 
          kycData.idBackUrl || '', 
          kycData.selfieUrl || '', 
          rejectionReason, 
          Date.now(), 
          Date.now()
        ]
      );
    } catch (sqlErr: any) {
      logger.warn(`Failed to insert KYC request into local SQL database: ${sqlErr.message}`);
    }

    // 4. Update Firebase Admin if needed (optional since frontend can do it, but server-side is more secure)
    if (adminDb) {
      const userRef = adminDb.collection('users').doc(userId);
      await userRef.update({
        kycStatus: status,
        kycSubmittedAt: new Date().toISOString(),
        idType: kycData.idType,
        fullName: kycData.fullName,
        kycRejectionReason: rejectionReason
      });

      // Also save to dedicated kycRequests collection for administrative tracking
      try {
        await adminDb.collection('kycRequests').add({
          userId,
          ...kycData,
          status,
          rejectionReason,
          submittedAt: new Date().toISOString(),
          timestamp: Date.now()
        });
      } catch (e) {}
    }

    res.json({ 
      success: true, 
      status, 
      rejectionReason 
    });

    // 5. Send Submission Confirmation Email
    try {
      const user = await get('SELECT email, display_name FROM users WHERE uid = ?', [userId]) as any;
      if (user && user.email) {
        const subject = 'ID Verification Received - Bivaax Trade';
        const html = `
          <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-w: 600px; margin: 0 auto; background-color: #f4f7f9; padding: 20px;">
            <div style="background-color: #1a1b23; padding: 30px; border-radius: 12px 12px 0 0; color: white; text-align: center;">
              <h2 style="color: #FFE24C; margin: 0;">Identity Verification Started</h2>
            </div>
            <div style="padding: 40px; background-color: white; border-radius: 0 0 12px 12px; border: 1px solid #e1e8ed;">
              <p>Hello ${kycData.fullName || user.display_name || 'Trader'},</p>
              <p>We have successfully received your identity verification (KYC) documents. Our compliance team is now reviewing your submission.</p>
              
              <div style="background-color: #f8fafc; border-radius: 8px; padding: 20px; margin: 25px 0; border-left: 4px solid #FFE24C;">
                <p style="margin: 0; font-weight: bold; color: #1e293b;">Status: UNDER REVIEW</p>
                <p style="margin: 5px 0 0; font-size: 14px; color: #64748b;">Estimated review time: 12-24 hours</p>
              </div>

              <div style="font-size: 14px; color: #64748b; line-height: 1.6;">
                <p><strong>Submitted Details:</strong></p>
                <ul style="margin: 10px 0; padding-left: 20px;">
                  <li>Document Type: ${kycData.idType}</li>
                  <li>Name: ${kycData.fullName}</li>
                </ul>
              </div>

              <p style="font-size: 14px; color: #64748b; line-height: 1.6;">You will receive another email once your verification status has been updated. Thank you for your patience.</p>
              
              <hr style="border: 0; border-top: 1px solid #edf2f7; margin: 30px 0;">
              <p style="font-size: 12px; color: #94a3b8; text-align: center;">&copy; 2026 Bivaax Trade Compliance Center</p>
            </div>
          </div>
        `;
        await sendEmail(user.email, subject, html);
      }
    } catch (e: any) {
      logger.error(`Failed to send KYC submission email: ${e.message}`);
    }
  } catch (err: any) {
    logger.error(`KYC submission failed for ${userId}: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// --- Admin & Support Routes ---

router.get('/user/details', async (req, res) => {
  const { uid } = req.query;
  if (!uid) return res.status(400).json({ error: 'UID is required' });

  try {
    const user = await get('SELECT * FROM users WHERE uid = ?', [uid]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ success: true, user });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- Firestore Sync Helper Functions ---
async function syncUserTransactions(userId: string) {
  if (!adminDb || !userId) return;
  try {
    const txsRef = adminDb.collection('users').doc(userId).collection('transactions');
    const snapshot = await txsRef.get();
    if (snapshot.empty) return;

    for (const doc of snapshot.docs) {
      const data = doc.data();
      const firestoreId = doc.id;
      
      const txHash = data.txHash || data.trxId || data.tx_hash || '';
      const amount = (data.amount || 0).toString();
      const type = (data.type || 'deposit').toLowerCase();
      const status = (data.status || 'pending').toLowerCase();
      const method = data.method || 'direct';
      const currency = data.currency || 'USD';
      const createdTime = data.timestamp || data.createdAt || Date.now();
      
      let existingTx = null;
      if (txHash) {
        existingTx = await get('SELECT id FROM transactions WHERE user_id = ? AND tx_hash = ?', [userId, txHash]);
      }
      
      if (!existingTx) {
        const pattern = `%${firestoreId}%`;
        existingTx = await get('SELECT id FROM transactions WHERE user_id = ? AND details LIKE ?', [userId, pattern]);
      }

      if (!existingTx) {
        existingTx = await get(
          'SELECT id FROM transactions WHERE user_id = ? AND type = ? AND amount = ? AND (created_at = ? OR created_at = ?)', 
          [userId, type, amount, createdTime, new Date(createdTime).toISOString()]
        );
      }

      const detailsObj = typeof data.details === 'object' ? { ...data.details, firestoreId } : { firestoreId, info: data.details || '' };

      if (!existingTx) {
        await run(
          `INSERT INTO transactions (user_id, type, amount, status, method, tx_hash, currency, details, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            userId,
            type,
            amount,
            status,
            method,
            txHash,
            currency,
            JSON.stringify(detailsObj),
            createdTime
          ]
        );
      } else {
        await run(
          `UPDATE transactions SET status = ?, updated_at = datetime('now') WHERE id = ? AND status != ?`,
          [status, existingTx.id, status]
        );
      }
    }
  } catch (err) {
    logger.error(`[syncUserTransactions] Error for user ${userId}: ${err}`);
  }
}

export async function syncGlobalTransactionsFromFirestore() {
  if (!adminDb) return;
  try {
    const checkHashStmt = db.prepare('SELECT id FROM transactions WHERE user_id = ? AND tx_hash = ? AND type = ?');
    const checkPatternStmt = db.prepare('SELECT id FROM transactions WHERE user_id = ? AND details LIKE ? AND type = ?');
    const checkExactStmt = db.prepare('SELECT id FROM transactions WHERE user_id = ? AND type = ? AND amount = ? AND created_at = ?');
    const insertStmt = db.prepare(`
      INSERT INTO transactions (user_id, type, amount, status, method, tx_hash, currency, details, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const updateStmt = db.prepare(`
      UPDATE transactions SET status = ?, updated_at = datetime('now') WHERE id = ? AND status != ?
    `);

    // 1. Sync Deposits
    const depositsSnap = await adminDb.collection('deposits').limit(500).get();
    let i = 0;
    const batchSize = 50;
    while (i < depositsSnap.docs.length) {
      db.prepare('BEGIN').run();
      try {
        const batch = depositsSnap.docs.slice(i, i + batchSize);
        for (const doc of batch) {
          const data = doc.data();
          const firestoreId = doc.id;
          const userId = data.userId;
          if (!userId) continue;

          const txHash = data.trxId || data.txHash || '';
          const amount = (data.amount || 0).toString();
          const status = (data.status === 'success' || data.status === 'approved') ? 'completed' : data.status || 'pending';
          const method = data.method || 'direct';
          const currency = data.currency || 'BDT';
          const createdTime = data.timestamp || Date.now();

          let existingTx = null;
          if (txHash) {
            existingTx = checkHashStmt.get(userId, txHash, 'deposit');
          }
          if (!existingTx) {
            existingTx = checkPatternStmt.get(userId, `%${firestoreId}%`, 'deposit');
          }
          if (!existingTx) {
            existingTx = checkExactStmt.get(userId, 'deposit', amount, createdTime);
          }

          const detailsObj = { firestoreId, walletNumber: data.walletNumber, orderId: data.orderId };

          if (!existingTx) {
            insertStmt.run(userId, 'deposit', amount, status, method, txHash, currency, JSON.stringify(detailsObj), createdTime);
          } else {
            updateStmt.run(status, (existingTx as any).id, status);
          }
        }
        db.prepare('COMMIT').run();
      } catch (txErr) {
        db.prepare('ROLLBACK').run();
      }
      i += batchSize;
      await new Promise(resolve => setImmediate(resolve));
    }

    // 2. Sync Withdrawals
    const withdrawalsSnap = await adminDb.collection('withdrawals').limit(500).get();
    i = 0;
    while (i < withdrawalsSnap.docs.length) {
      db.prepare('BEGIN').run();
      try {
        const batch = withdrawalsSnap.docs.slice(i, i + batchSize);
        for (const doc of batch) {
          const data = doc.data();
          const firestoreId = doc.id;
          const userId = data.userId;
          if (!userId) continue;

          const txHash = data.txHash || '';
          const amount = (data.amount || 0).toString();
          const status = (data.status === 'success' || data.status === 'approved') ? 'completed' : data.status || 'pending';
          const method = data.method || 'direct';
          const currency = data.currency || 'USD';
          const createdTime = data.timestamp || Date.now();

          let existingTx = null;
          if (txHash) {
            existingTx = checkHashStmt.get(userId, txHash, 'withdrawal');
          }
          if (!existingTx) {
            existingTx = checkPatternStmt.get(userId, `%${firestoreId}%`, 'withdrawal');
          }
          if (!existingTx) {
            existingTx = checkExactStmt.get(userId, 'withdrawal', amount, createdTime);
          }

          const detailsObj = { firestoreId, walletNumber: data.walletNumber, bankDetails: data.details };

          if (!existingTx) {
            insertStmt.run(userId, 'withdrawal', amount, status, method, txHash, currency, JSON.stringify(detailsObj), createdTime);
          } else {
            updateStmt.run(status, (existingTx as any).id, status);
          }
        }
        db.prepare('COMMIT').run();
      } catch (txErr) {
        db.prepare('ROLLBACK').run();
      }
      i += batchSize;
      await new Promise(resolve => setImmediate(resolve));
    }
  } catch (err) {
    logger.error(`[syncGlobalTransactionsFromFirestore] Error: ${err}`);
  }
}

export async function syncKYCRequestsFromFirestore() {
  if (!adminDb) return;
  try {
    const snapshot = await adminDb.collection('kycRequests').limit(200).get();
    if (snapshot.empty) return;

    const checkStmt = db.prepare('SELECT id FROM kyc_requests WHERE user_id = ? AND status = ? AND document_number = ?');
    const insertStmt = db.prepare(`
      INSERT INTO kyc_requests (user_id, status, full_name, document_type, document_number, front_image, back_image, selfie_image, rejection_reason, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    let i = 0;
    const batchSize = 50;
    while (i < snapshot.docs.length) {
      db.prepare('BEGIN').run();
      try {
        const batch = snapshot.docs.slice(i, i + batchSize);
        for (const doc of batch) {
          const data = doc.data();
          const userId = data.userId;
          if (!userId) continue;

          const status = data.status || 'pending';
          const fullName = data.fullName || '';
          const documentType = data.idType || '';
          const documentNumber = data.idNumber || '';
          const frontImage = data.idFrontUrl || '';
          const backImage = data.idBackUrl || '';
          const selfieImage = data.selfieUrl || '';
          const rejectionReason = data.rejectionReason || '';
          const submittedAt = data.submittedAt || Date.now();
          const updatedAt = data.updatedAt instanceof Date ? data.updatedAt.getTime() : (data.updatedAt || Date.now());

          const existing = checkStmt.get(userId, status, documentNumber);
          if (!existing) {
            insertStmt.run(userId, status, fullName, documentType, documentNumber, frontImage, backImage, selfieImage, rejectionReason, submittedAt, updatedAt);
          }
        }
        db.prepare('COMMIT').run();
      } catch (txErr) {
        db.prepare('ROLLBACK').run();
      }
      i += batchSize;
      await new Promise(resolve => setImmediate(resolve));
    }
  } catch (err: any) {
    logger.error(`[syncKYCRequestsFromFirestore] Error: ${err.message}`);
  }
}

export async function syncTradesFromFirestore() {
  if (!adminDb) return;
  try {
    const snapshot = await adminDb.collection('trades').orderBy('createdAt', 'desc').limit(500).get();
    if (snapshot.empty) return;

    const checkStmt = db.prepare('SELECT id FROM trades WHERE firebase_id = ?');
    const insertStmt = db.prepare(`
      INSERT INTO trades (firebase_id, user_id, market_id, amount, direction, entry_price, exit_price, duration, expiry_time, is_demo, status, payout_amount, settled_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const updateStmt = db.prepare(`
      UPDATE trades SET status = ?, exit_price = ?, payout_amount = ?, settled_at = ? WHERE firebase_id = ? AND status != ?
    `);

    db.prepare('BEGIN').run();
    try {
      for (const doc of snapshot.docs) {
        const data = doc.data();
        const firebaseId = doc.id;

        const userId = data.userId;
        const marketId = data.marketId;
        const amount = data.amount;
        const direction = data.direction;
        const entryPrice = data.entryPrice;
        const exitPrice = data.exitPrice || null;
        const duration = data.duration;
        const expiryTime = data.expiryTime;
        const isDemo = data.isDemo ? 1 : 0;
        const status = data.status || 'open';
        const payoutAmount = data.payoutAmount || 0;
        const settledAt = data.settledAt || null;
        const createdAt = data.createdAt || Date.now();

        const existing = checkStmt.get(firebaseId);
        if (!existing) {
          insertStmt.run(firebaseId, userId, marketId, amount, direction, entryPrice, exitPrice, duration, expiryTime, isDemo, status, payoutAmount, settledAt, createdAt);
        } else {
          updateStmt.run(status, exitPrice, payoutAmount, settledAt, firebaseId, status);
        }
      }
      db.prepare('COMMIT').run();
    } catch (txErr) {
      db.prepare('ROLLBACK').run();
      logger.error(`[syncTradesFromFirestore] Batch transaction failed: ${txErr}`);
    }
  } catch (err: any) {
    logger.error(`[syncTradesFromFirestore] Error: ${err.message}`);
  }
}

let adminSeeded = false;
export async function ensureSeedAdminUser() {
  if (adminSeeded) return;
  const adminEmail = 'hamproosapport@gmail.com';
  const adminPass = 'Mdhasan';
  try {
    logger.info(`👤 Ensuring seed admin user ${adminEmail} is present...`);
    const hashedPassword = await bcrypt.hash(adminPass, 10);
    
    // Check if user exists in SQLite
    const existing = await get('SELECT * FROM users WHERE email = ?', [adminEmail]) as any;
    if (!existing) {
      const uid = 'admin_seed_' + Math.random().toString(36).substring(2, 10);
      const affiliateId = Math.random().toString(36).substring(2, 8).toUpperCase();
      await run(
        `INSERT INTO users (uid, email, password_hash, display_name, nickname, referral_code, is_admin, real_balance, demo_balance, created_at) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [uid, adminEmail, hashedPassword, 'Bivaax Super Admin', 'Admin', affiliateId, 1, 1000.00, 10000.00, Date.now()]
      );
      logger.info(`✅ Seed admin user created in SQLite.`);
      
      // Sync to Firestore if initialized
      if (adminDb) {
        const userRef = adminDb.collection('users').doc(uid);
        await userRef.set({
          uid,
          email: adminEmail,
          displayName: 'Bivaax Super Admin',
          nickname: 'Admin',
          realBalance: 1000.00,
          demoBalance: 10000.00,
          isAdmin: true,
          isVerified: true,
          affiliateId,
          referralCode: affiliateId,
          createdAt: Date.now()
        }, { merge: true });
        logger.info(`✅ Seed admin user synced to Firestore.`);
      }
    } else {
      // User exists, update password and make sure they are admin
      await run('UPDATE users SET password_hash = ?, is_admin = 1 WHERE email = ?', [hashedPassword, adminEmail]);
      logger.info(`✅ Seed admin user password updated/verified in SQLite.`);
      
      if (adminDb) {
        const userSnap = await adminDb.collection('users').where('email', '==', adminEmail).get();
        if (!userSnap.empty) {
          const userDoc = userSnap.docs[0];
          await adminDb.collection('users').doc(userDoc.id).set({
            isAdmin: true,
            isVerified: true
          }, { merge: true });
          logger.info(`✅ Seed admin user permissions verified in Firestore.`);
        } else {
          // Sync existing SQLite user to Firestore
          const freshUser = await get('SELECT * FROM users WHERE email = ?', [adminEmail]);
          if (freshUser) {
            const mapped = mapUserForFrontend(freshUser);
            if (mapped) {
              await adminDb.collection('users').doc((freshUser as any).uid).set({
                ...mapped,
                password: hashedPassword
              }, { merge: true });
              logger.info(`✅ Seed admin user synced from SQLite to Firestore.`);
            }
          }
        }
      }
    }
  } catch (err: any) {
    logger.error(`❌ Failed to ensure seed admin user: ${err.message}`);
  }
}

export async function seedPromoServer() {
  if (!adminDb) return;
  try {
    const newsSnap = await adminDb.collection('news').where('title', '==', '50% Deposit Bonus').get();
    
    const promoContent = `Promo Code: BIVAAXFAST50

Offer Details:
• Get 50% Bonus on your Deposit
• Fast Bonus Credit
• Secure & Trusted Platform
• Instant Deposit Processing
• Limited Time Offer

Trade Smart. Earn Big.`;

    if (newsSnap.empty) {
      await adminDb.collection('news').add({
        title: "50% Deposit Bonus",
        description: "Boost Your Trading with Every Deposit!",
        content: promoContent,
        imageUrl: "https://i.postimg.cc/FHrDvXtr/file-0000000087d081fabe530d525061bcac.png",
        emoji: "🚀",
        date: new Date().toLocaleDateString(),
        ctaText: "DEPOSIT NOW",
        actionType: "deposit",
        actionValue: "BIVAAXFAST50",
        isPlatformNews: true,
        reactions: 100,
        badReactions: 0
      });
      logger.info("News Promo seeded successfully on server");
    } else {
      const docId = newsSnap.docs[0].id;
      await adminDb.collection('news').doc(docId).update({
        description: "Boost Your Trading with Every Deposit!",
        content: promoContent,
        isPlatformNews: true,
        actionType: "deposit",
        actionValue: "BIVAAXFAST50",
        ctaText: "DEPOSIT NOW",
        imageUrl: "https://i.postimg.cc/FHrDvXtr/file-0000000087d081fabe530d525061bcac.png"
      });
    }

    const promoSnap = await adminDb.collection('promos').where('code', '==', 'BIVAAXFAST50').get();
    if (promoSnap.empty) {
      await adminDb.collection('promos').add({
        code: 'BIVAAXFAST50',
        bonusPercentage: 50,
        isActive: true,
        isBonusActive: true,
        expiryDate: new Date().getTime() + (1000 * 60 * 60 * 24 * 30) // 30 days
      });
      logger.info("Promo code seeded successfully on server");
    }
  } catch (err: any) {
    logger.error(`Error seeding promo on server: ${err.message}`);
  }
}

export async function syncDatabaseFromFirestore() {
  if (!adminDb) {
    logger.warn('[syncDatabaseFromFirestore] adminDb is not initialized. Skipping boot sync.');
    await ensureSeedAdminUser();
    return;
  }
  logger.info('🔄 Starting server boot-time database synchronization from Firestore...');

  try {
    logger.info('👤 Syncing users...');
    try {
      await syncAllUsersFromFirestore();
    } catch (userErr: any) {
      logger.error(`Failed to sync users: ${userErr.message}`);
    }
    await new Promise(resolve => setImmediate(resolve));

    logger.info('💸 Syncing global transactions...');
    try {
      await syncGlobalTransactionsFromFirestore();
    } catch (txErr: any) {
      logger.error(`Failed to sync transactions: ${txErr.message}`);
    }
    await new Promise(resolve => setImmediate(resolve));

    logger.info('🪪 Syncing KYC requests...');
    try {
      await syncKYCRequestsFromFirestore();
    } catch (kycErr: any) {
      logger.error(`Failed to sync KYC: ${kycErr.message}`);
    }
    await new Promise(resolve => setImmediate(resolve));

    logger.info('📈 Syncing trades...');
    try {
      await syncTradesFromFirestore();
    } catch (tradeErr: any) {
      logger.error(`Failed to sync trades: ${tradeErr.message}`);
    }
    await new Promise(resolve => setImmediate(resolve));

    // Ensure the seed admin exists and is up to date
    await ensureSeedAdminUser();

    // Run news and promo seeding securely from server-side
    logger.info('📣 Seeding news and promos on server...');
    await seedPromoServer();

    logger.info('✅ Boot-time synchronization completed successfully.');
  } catch (err: any) {
    logger.error(`❌ Boot-time database synchronization failed: ${err.message}`);
  }
}

export async function syncAllUsersFromFirestore() {
  if (!adminDb) return;
  try {
    // Limit to latest 1000 users to keep boot sync safe
    const snapshot = await adminDb.collection('users').limit(1000).get();
    if (snapshot.empty) return;

    const checkStmt = db.prepare('SELECT id, real_balance, demo_balance, is_verified, kyc_status, display_name, password_hash, affiliate_balance, total_affiliate_earnings, referral_count FROM users WHERE uid = ?');
    const insertStmt = db.prepare(`
      INSERT OR IGNORE INTO users (uid, email, password_hash, display_name, nickname, photo_url, real_balance, demo_balance, currency, is_verified, is_admin, kyc_status, referral_code, referred_by_uid, total_live_volume, country, country_code, affiliate_balance, total_affiliate_earnings, referral_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    let i = 0;
    const batchSize = 50;
    while (i < snapshot.docs.length) {
      db.prepare('BEGIN').run();
      try {
        const batch = snapshot.docs.slice(i, i + batchSize);
        for (const doc of batch) {
          const fbData = doc.data();
          const uid = doc.id;
          const email = fbData.email || '';
          
          const realBalance = fbData.balance || fbData.real_balance || fbData.realBalance || '0.00';
          const demoBalance = fbData.demoBalance || fbData.demo_balance || '10000.00';
          const isVerified = (fbData.isVerified || fbData.is_verified || fbData.emailVerified) ? 1 : 0;
          const kycStatus = fbData.kycStatus || fbData.kyc_status || 'unverified';
          const passwordValue = fbData.password_hash || fbData.passwordHash || fbData.password || null;
          const displayName = fbData.displayName || fbData.display_name || '';
          const nickname = fbData.nickname || '';
          const photoURL = fbData.photoURL || fbData.photo_url || '';
          const currency = fbData.currency || 'USD';
          const country = fbData.country || '';
          const countryCode = fbData.countryCode || fbData.country_code || '';
          const is_admin = (fbData.isAdmin || fbData.is_admin) ? 1 : 0;
          const referralCode = fbData.referralCode || fbData.referral_code || Math.random().toString(36).substring(2, 8).toUpperCase();
          const referredByUid = fbData.referredBy || fbData.referred_by_uid || null;
          const totalLiveVolume = fbData.totalLiveVolume || fbData.total_live_volume || '0.00';
          const referralCount = fbData.referralCount || fbData.referral_count || 0;
          const affiliateBalance = fbData.affiliateBalance || fbData.affiliate_balance || '0.00';
          const totalAffiliateEarnings = fbData.totalAffiliateEarnings || fbData.total_affiliate_earnings || '0.00';

          const user = checkStmt.get(uid) as any;

          if (!user) {
            insertStmt.run(
              uid, email, passwordValue, displayName, nickname, photoURL, 
              realBalance.toString(), demoBalance.toString(), currency, isVerified, is_admin, kycStatus, 
              referralCode, referredByUid, totalLiveVolume.toString(), country, countryCode,
              affiliateBalance.toString(), totalAffiliateEarnings.toString(), referralCount
            );
          } else {
            let needsUpdate = false;
            const updates: string[] = [];
            const params: any[] = [];

            if (parseFloat(user.real_balance || 0) !== parseFloat(realBalance || 0)) {
              updates.push('real_balance = ?');
              params.push(realBalance.toString());
              needsUpdate = true;
            }
            if (parseFloat(user.demo_balance || 10000) !== parseFloat(demoBalance || 10000)) {
              updates.push('demo_balance = ?');
              params.push(demoBalance.toString());
              needsUpdate = true;
            }
            if (parseFloat(user.affiliate_balance || 0) !== parseFloat(affiliateBalance || 0)) {
              updates.push('affiliate_balance = ?');
              params.push(affiliateBalance.toString());
              needsUpdate = true;
            }
            if (parseFloat(user.total_affiliate_earnings || 0) !== parseFloat(totalAffiliateEarnings || 0)) {
              updates.push('total_affiliate_earnings = ?');
              params.push(totalAffiliateEarnings.toString());
              needsUpdate = true;
            }
            if (user.referral_count !== referralCount) {
              updates.push('referral_count = ?');
              params.push(referralCount);
              needsUpdate = true;
            }
            if (user.is_verified !== isVerified) {
              updates.push('is_verified = ?');
              params.push(isVerified);
              needsUpdate = true;
            }
            if (user.kyc_status !== kycStatus) {
              updates.push('kyc_status = ?');
              params.push(kycStatus);
              needsUpdate = true;
            }
            if (displayName && user.display_name !== displayName) {
              updates.push('display_name = ?');
              params.push(displayName);
              needsUpdate = true;
            }
            if (passwordValue && user.password_hash !== passwordValue) {
              updates.push('password_hash = ?');
              params.push(passwordValue);
              needsUpdate = true;
            }

            if (needsUpdate) {
              params.push(uid);
              db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE uid = ?`).run(...params);
            }
          }
        }
        db.prepare('COMMIT').run();
      } catch (txErr) {
        db.prepare('ROLLBACK').run();
      }
      i += batchSize;
      await new Promise(resolve => setImmediate(resolve));
    }
  } catch (err: any) {
    logger.error(`[syncAllUsersFromFirestore] Error: ${err.message}`);
  }
}

// 1. User Sync (called on app load / terminal boot)
router.post('/user/sync', async (req, res) => {
  const { 
    uid, email, displayName, photoURL, nickname, country, countryCode, 
    referralCode, referralSubId, referralType,
    firstName, lastName, gender, dob
  } = req.body;
  if (!uid) {
    logger.error('Sync failed: uid is missing');
    return res.status(400).json({ error: 'uid is required' });
  }

  try {
    logger.info(`Syncing user: ${uid} (${email || 'no email'})`);
    let ip = req.ip || '';
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
      const parts = (typeof forwarded === 'string' ? forwarded : forwarded[0]).split(',');
      ip = parts[0].trim();
    }

    let user = await get('SELECT * FROM users WHERE uid = ?', [uid]) as any;
    
    // Restoration Logic: Check Firestore for existing verification status
    let firestoreData: any = null;
    if (adminDb) {
      try {
        const doc = await adminDb.collection('users').doc(uid).get();
        if (doc.exists) {
          firestoreData = doc.data();
          logger.info(`Found Firestore data for user ${uid}`);
        }
      } catch (e: any) {
        logger.error(`Firestore lookup failed for ${uid}: ${e.message}`);
      }
    }

    if (!user) {
      logger.info(`User ${uid} not found in SQLite, creating...`);
      const { countryName, countryCode: detectedCode } = (country && countryCode) ? { countryName: country, countryCode: countryCode } : await getCountryFromIp(ip);
      const affiliateId = String(firestoreData?.referralCode || firestoreData?.affiliateId || Math.random().toString(36).substring(2, 8).toUpperCase());
      
      let referredBy = null;
      if (referralCode) {
        // First check in SQLite
        const referrer = await get('SELECT uid FROM users WHERE referral_code = ? OR uid = ?', [referralCode, referralCode]);
        if (referrer) {
          referredBy = (referrer as any).uid;
        } else if (adminDb) {
          // Fallback to Firestore to find the referrer
          try {
            let referrerSnap = await adminDb.collection('users').where('affiliateId', '==', isNaN(Number(referralCode)) ? referralCode : Number(referralCode)).get();
            if (referrerSnap.empty) {
              referrerSnap = await adminDb.collection('users').where('referralCode', '==', referralCode).get();
            }
            if (referrerSnap.empty) {
              referrerSnap = await adminDb.collection('users').where('uid', '==', referralCode).get();
            }
            if (!referrerSnap.empty) {
              referredBy = referrerSnap.docs[0].id;
            }
          } catch (e: any) {
            logger.warn(`Failed to lookup referrer ${referralCode} in Firestore: ${e.message}`);
          }
        }
      }

      const isVerified = (firestoreData?.is_verified || firestoreData?.isVerified || firestoreData?.emailVerified) ? 1 : 0;
      const kycStatus = firestoreData?.kyc_status || firestoreData?.kycStatus || 'unverified';
      const realBalance = firestoreData?.balance || firestoreData?.real_balance || firestoreData?.realBalance || '0.00';
      const demoBalance = firestoreData?.demoBalance || firestoreData?.demo_balance || '10000.00';
      const passwordValue = firestoreData?.password_hash || firestoreData?.passwordHash || firestoreData?.password || null;
      const affiliateBalance = firestoreData?.affiliateBalance || firestoreData?.affiliate_balance || '0.00';
      const totalAffiliateEarnings = firestoreData?.totalAffiliateEarnings || firestoreData?.total_affiliate_earnings || '0.00';
      const referralCount = firestoreData?.referralCount || firestoreData?.referral_count || 0;
      const createdAt = Date.now();

      await run(
        `INSERT OR IGNORE INTO users (uid, email, password_hash, display_name, nickname, photo_url, referral_code, real_balance, demo_balance, country, country_code, referred_by_uid, referral_sub_id, referral_type, first_name, last_name, gender, dob, is_verified, kyc_status, affiliate_balance, total_affiliate_earnings, referral_count, created_at) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          uid, email || '', passwordValue, displayName || '', nickname || '', photoURL || '', affiliateId, realBalance, demoBalance, 
          countryName, countryCode || detectedCode, referredBy, referralSubId || null, referralType || null,
          firstName || null, lastName || null, gender || null, dob ? (typeof dob === 'object' ? JSON.stringify(dob) : dob) : null,
          isVerified, kycStatus, affiliateBalance, totalAffiliateEarnings, referralCount, createdAt
        ]
      );
      logger.info(`Successfully ensured user ${uid} in SQLite`);
      
      if (referredBy) {
        await run('UPDATE users SET referral_count = referral_count + 1 WHERE uid = ?', [referredBy]);
        // Sync referrer to Firestore immediately to persist count
        const updatedReferrer = await get('SELECT * FROM users WHERE uid = ?', [referredBy]);
        if (updatedReferrer) {
          syncUserToFirestore(referredBy, mapUserForFrontend(updatedReferrer));
        }
      }
      
      user = await get('SELECT * FROM users WHERE uid = ?', [uid]) as any;
    } else {
      let needsUpdate = false;
      const updates: string[] = [];
      const params: any[] = [];

      const ownReferralCode = firestoreData?.referralCode || firestoreData?.affiliateId;
      if (ownReferralCode && user.referral_code !== String(ownReferralCode)) {
        updates.push('referral_code = ?');
        params.push(String(ownReferralCode));
        needsUpdate = true;
      }

      const refBy = firestoreData?.referredBy || firestoreData?.referredByUid || firestoreData?.referred_by_uid;
      if (refBy && user.referred_by_uid !== refBy) {
        updates.push('referred_by_uid = ?');
        params.push(refBy);
        needsUpdate = true;
      }
      
      if (!user.display_name && displayName) {
        updates.push('display_name = ?');
        params.push(displayName);
        needsUpdate = true;
      }
      if (nickname && user.nickname !== nickname) {
        updates.push('nickname = ?');
        params.push(nickname);
        needsUpdate = true;
      }
      if (!user.photo_url && photoURL) {
        updates.push('photo_url = ?');
        params.push(photoURL);
        needsUpdate = true;
      }
      if (!user.country || (country && user.country !== country)) {
        const countryName = country || (await getCountryFromIp(ip)).countryName;
        updates.push('country = ?');
        params.push(countryName);
        needsUpdate = true;
      }
      if (!user.country_code || (countryCode && user.country_code !== countryCode)) {
        const cCode = countryCode || (await getCountryFromIp(ip)).countryCode;
        updates.push('country_code = ?');
        params.push(cCode);
        needsUpdate = true;
      }
      if (firstName && user.first_name !== firstName) {
        updates.push('first_name = ?');
        params.push(firstName);
        needsUpdate = true;
      }
      if (lastName && user.last_name !== lastName) {
        updates.push('last_name = ?');
        params.push(lastName);
        needsUpdate = true;
      }
      if (gender && user.gender !== gender) {
        updates.push('gender = ?');
        params.push(gender);
        needsUpdate = true;
      }
      if (dob && user.dob !== (typeof dob === 'object' ? JSON.stringify(dob) : dob)) {
        updates.push('dob = ?');
        params.push(typeof dob === 'object' ? JSON.stringify(dob) : dob);
        needsUpdate = true;
      }

      // Restore verification status from Firestore if missing in SQL
      if (firestoreData) {
        const isVerifiedVal = (firestoreData.is_verified || firestoreData.isVerified || firestoreData.emailVerified) ? 1 : 0;
        if (isVerifiedVal !== user.is_verified) {
          updates.push('is_verified = ?');
          params.push(isVerifiedVal);
          needsUpdate = true;
        }

        const fsKyc = firestoreData.kyc_status || firestoreData.kycStatus;
        if (fsKyc && fsKyc !== user.kyc_status) {
          updates.push('kyc_status = ?');
          params.push(fsKyc);
          needsUpdate = true;
        }

        const fsRealBalance = firestoreData.balance !== undefined ? firestoreData.balance : (firestoreData.real_balance !== undefined ? firestoreData.real_balance : firestoreData.realBalance);
        if (fsRealBalance !== undefined && fsRealBalance !== null && parseFloat(fsRealBalance) !== parseFloat(user.real_balance || 0)) {
          updates.push('real_balance = ?');
          params.push(fsRealBalance.toString());
          needsUpdate = true;
        }

        const fsAffiliateBalance = firestoreData.affiliateBalance !== undefined ? firestoreData.affiliateBalance : firestoreData.affiliate_balance;
        if (fsAffiliateBalance !== undefined && fsAffiliateBalance !== null && parseFloat(fsAffiliateBalance) !== parseFloat(user.affiliate_balance || 0)) {
          updates.push('affiliate_balance = ?');
          params.push(fsAffiliateBalance.toString());
          needsUpdate = true;
        }

        const fsTotalAffiliateEarnings = firestoreData.totalAffiliateEarnings !== undefined ? firestoreData.totalAffiliateEarnings : firestoreData.total_affiliate_earnings;
        if (fsTotalAffiliateEarnings !== undefined && fsTotalAffiliateEarnings !== null && parseFloat(fsTotalAffiliateEarnings) !== parseFloat(user.total_affiliate_earnings || 0)) {
          updates.push('total_affiliate_earnings = ?');
          params.push(fsTotalAffiliateEarnings.toString());
          needsUpdate = true;
        }

        const fsReferralCount = firestoreData.referralCount !== undefined ? firestoreData.referralCount : firestoreData.referral_count;
        if (fsReferralCount !== undefined && fsReferralCount !== null && parseInt(fsReferralCount) !== parseInt(user.referral_count || 0)) {
          updates.push('referral_count = ?');
          params.push(parseInt(fsReferralCount));
          needsUpdate = true;
        }

        const fsPasswordHash = firestoreData.password_hash || firestoreData.passwordHash || firestoreData.password;
        if (fsPasswordHash && user.password_hash !== fsPasswordHash) {
          updates.push('password_hash = ?');
          params.push(fsPasswordHash);
          needsUpdate = true;
        }

        const fsDemoBalance = firestoreData.demoBalance !== undefined ? firestoreData.demoBalance : (firestoreData.demo_balance !== undefined ? firestoreData.demo_balance : firestoreData.demoBalance);
        if (fsDemoBalance !== undefined && fsDemoBalance !== null && parseFloat(fsDemoBalance) !== parseFloat(user.demo_balance || 10000)) {
          updates.push('demo_balance = ?');
          params.push(fsDemoBalance);
          needsUpdate = true;
        }

        if (firestoreData.password && firestoreData.password !== user.password) {
          updates.push('password = ?');
          params.push(firestoreData.password);
          needsUpdate = true;
        }
      }
      
      if (needsUpdate) {
        params.push(uid);
        await run(`UPDATE users SET ${updates.join(', ')} WHERE uid = ?`, params);
        user = await get('SELECT * FROM users WHERE uid = ?', [uid]) as any;
      }
    }

    // Sync user transactions from Firestore to SQLite to guarantee persistence across app updates
    await syncUserTransactions(uid);
    // Sync user specific trades from Firestore
    await syncUserSpecificTradesFromFirestore(uid);

    const mappedData = mapUserForFrontend(user);
    if (mappedData) {
      syncUserToFirestore(uid, mappedData);
    }
    res.json({ success: true, data: mappedData });
  } catch (err: any) {
    logger.error(`User sync failed: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

export async function syncUserSpecificTradesFromFirestore(uid: string) {
  if (!adminDb || !uid) return;
  try {
    const snapshot = await adminDb.collection('trades').where('userId', '==', uid).get();
    if (snapshot.empty) return;

    const checkStmt = db.prepare('SELECT id FROM trades WHERE firebase_id = ?');
    const insertStmt = db.prepare(`
      INSERT INTO trades (firebase_id, user_id, market_id, amount, direction, entry_price, exit_price, duration, expiry_time, is_demo, status, payout_amount, settled_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const updateStmt = db.prepare(`
      UPDATE trades SET status = ?, exit_price = ?, payout_amount = ?, settled_at = ? WHERE firebase_id = ? AND status != ?
    `);

    db.prepare('BEGIN').run();
    try {
      for (const doc of snapshot.docs) {
        const data = doc.data();
        const firebaseId = doc.id;

        const marketId = data.marketId;
        const amount = data.amount;
        const direction = data.direction;
        const entryPrice = data.entryPrice;
        const exitPrice = data.exitPrice || null;
        const duration = data.duration;
        const expiryTime = data.expiryTime;
        const isDemo = data.isDemo ? 1 : 0;
        const status = data.status || 'open';
        const payoutAmount = data.payoutAmount || 0;
        const settledAt = data.settledAt || null;
        const createdAt = data.createdAt || Date.now();

        const existing = checkStmt.get(firebaseId);
        if (!existing) {
          insertStmt.run(firebaseId, uid, marketId, amount, direction, entryPrice, exitPrice, duration, expiryTime, isDemo, status, payoutAmount, settledAt, createdAt);
        } else {
          updateStmt.run(status, exitPrice, payoutAmount, settledAt, firebaseId, status);
        }
      }
      db.prepare('COMMIT').run();
    } catch (txErr) {
      db.prepare('ROLLBACK').run();
      logger.error(`[syncUserSpecificTrades] Failed for ${uid}: ${txErr}`);
    }
  } catch (err: any) {
    logger.error(`[syncUserSpecificTrades] Error: ${err.message}`);
  }
}

// 2. Check 2FA Configuration
router.get('/user/check-2fa', async (req, res) => {
  const { uid } = req.query;
  if (!uid) return res.status(400).json({ error: 'uid is required' });

  try {
    const user = await get('SELECT tfa_enabled, tfa_mode, tfa_secret FROM users WHERE uid = ?', [uid]) as any;
    if (!user) {
      return res.json({ tfaEnabled: false });
    }
    res.json({
      tfaEnabled: !!user.tfa_enabled,
      tfaMode: user.tfa_mode || 'app',
      tfaSecret: user.tfa_secret || null
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Update Profile (PATCH users)
router.patch('/users/:id', requireAuth, async (req: AuthRequest, res) => {
  const { id } = req.params;
  if (req.user!.uid !== id && !req.user!.isAdmin) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    const updates: string[] = [];
    const params: any[] = [];

    const fieldMap: { [key: string]: string } = {
      displayName: 'display_name',
      firstName: 'first_name',
      lastName: 'last_name',
      gender: 'gender',
      dob: 'dob',
      nickname: 'nickname',
      photoURL: 'photo_url',
      currency: 'currency',
      country: 'country',
      countryCode: 'country_code',
      tfaEnabled: 'tfa_enabled',
      tfaMode: 'tfa_mode',
      tfaSecret: 'tfa_secret',
      phone: 'phone',
      kycStatus: 'kyc_status',
      realBalance: 'real_balance',
      demoBalance: 'demo_balance',
      balance: 'real_balance',
    };

    for (const [key, value] of Object.entries(req.body)) {
      const dbField = fieldMap[key];
      if (dbField) {
        if (typeof value === 'object' && value !== null && (value as any).increment !== undefined) {
          updates.push(`${dbField} = ${dbField} + ?`);
          params.push((value as any).increment);
        } else if (typeof value === 'object' && value !== null) {
          updates.push(`${dbField} = ?`);
          params.push(JSON.stringify(value));
        } else if (typeof value === 'boolean') {
          updates.push(`${dbField} = ?`);
          params.push(value ? 1 : 0);
        } else {
          updates.push(`${dbField} = ?`);
          params.push(value);
        }
      }
    }

    if (updates.length > 0) {
      params.push(id);
      await run(`UPDATE users SET ${updates.join(', ')} WHERE uid = ?`, params);
      
      // Send Profile Update Notification Email
      try {
        const user = await get('SELECT * FROM users WHERE uid = ?', [id]) as any;
        if (user && user.email) {
          const personalFields = ['displayName', 'firstName', 'lastName', 'nickname', 'phone', 'country', 'gender', 'dob'];
          const wasPersonalUpdate = Object.keys(req.body).some(k => personalFields.includes(k));
          
          if (wasPersonalUpdate) {
            const subject = 'Profile Updated - Bivaax Trade';
            const html = `
              <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-w: 600px; margin: 0 auto; background-color: #f4f7f9; padding: 20px;">
                <div style="background-color: #1a1b23; padding: 30px; border-radius: 12px 12px 0 0; color: white; text-align: center;">
                  <h2 style="color: #FFE24C; margin: 0;">Security Alert: Profile Update</h2>
                </div>
                <div style="padding: 40px; background-color: white; border-radius: 0 0 12px 12px; border: 1px solid #e1e8ed;">
                  <p>Hello ${user.display_name || 'Trader'},</p>
                  <p>This is a confirmation that your Bivaax Trade profile information was recently updated.</p>
                  
                  <div style="background-color: #f8fafc; border-radius: 8px; padding: 20px; margin: 25px 0;">
                    <h4 style="margin: 0 0 15px 0; color: #1e293b; border-bottom: 1px solid #e2e8f0; padding-bottom: 10px;">Updated Information:</h4>
                    <table style="width: 100%; font-size: 14px; border-collapse: collapse;">
                      ${user.first_name ? `<tr><td style="padding: 8px 0; color: #64748b;">First Name:</td><td style="padding: 8px 0; color: #1e293b; font-weight: 600; text-align: right;">${user.first_name}</td></tr>` : ''}
                      ${user.last_name ? `<tr><td style="padding: 8px 0; color: #64748b;">Last Name:</td><td style="padding: 8px 0; color: #1e293b; font-weight: 600; text-align: right;">${user.last_name}</td></tr>` : ''}
                      ${user.nickname ? `<tr><td style="padding: 8px 0; color: #64748b;">Nickname:</td><td style="padding: 8px 0; color: #1e293b; font-weight: 600; text-align: right;">${user.nickname}</td></tr>` : ''}
                      ${user.phone ? `<tr><td style="padding: 8px 0; color: #64748b;">Phone:</td><td style="padding: 8px 0; color: #1e293b; font-weight: 600; text-align: right;">${user.phone}</td></tr>` : ''}
                      ${user.country ? `<tr><td style="padding: 8px 0; color: #64748b;">Country:</td><td style="padding: 8px 0; color: #1e293b; font-weight: 600; text-align: right;">${user.country}</td></tr>` : ''}
                    </table>
                  </div>

                  <p style="font-size: 14px; color: #64748b; line-height: 1.6;">If you did not make these changes, please contact our security team immediately or reset your password.</p>
                  
                  <hr style="border: 0; border-top: 1px solid #edf2f7; margin: 30px 0;">
                  <p style="font-size: 12px; color: #94a3b8; text-align: center;">&copy; 2026 Bivaax Trade Security Department</p>
                </div>
              </div>
            `;
            await sendEmail(user.email, subject, html);
          }
        }
      } catch (e: any) {
        logger.error(`Failed to send profile update email: ${e.message}`);
      }
    }

    const updatedUser = await get('SELECT * FROM users WHERE uid = ?', [id]);
    const mappedData = mapUserForFrontend(updatedUser);
    if (mappedData) {
      await syncUserToFirestore(id, mappedData);
    }
    res.json(mappedData);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Fetch User Trades
router.get('/user-trades', async (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: 'userId is required' });
  
  try {
    const trades = await query(
      'SELECT * FROM trades WHERE user_id = ? ORDER BY created_at DESC LIMIT 100',
      [userId]
    );
    res.json({ success: true, trades: trades.map(mapTrade) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Fetch User Tickets
router.get('/user-tickets', async (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: 'userId is required' });

  try {
    const userTickets = await query(
      'SELECT * FROM tickets WHERE user_id = ? ORDER BY updated_at DESC LIMIT 100',
      [userId]
    );
    res.json({ success: true, tickets: userTickets.map(mapTicket) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- Market Movers Widget (FMP API) ---
router.get('/market-movers', async (req, res) => {
  const mockMovers = [
    { symbol: 'AAPL', name: 'Apple Inc.', change: 2.45, price: 189.45, volatility: 0.15 },
    { symbol: 'TSLA', name: 'Tesla, Inc.', change: -5.12, price: 238.12, volatility: 0.45 },
    { symbol: 'NVDA', name: 'NVIDIA Corp.', change: 3.89, price: 475.20, volatility: 0.35 },
    { symbol: 'AMZN', name: 'Amazon.com', change: 1.12, price: 145.10, volatility: 0.12 },
    { symbol: 'META', name: 'Meta Platforms', change: -2.15, price: 320.15, volatility: 0.25 }
  ];

  try {
    const apiKey = process.env.FMP_API_KEY;
    if (!apiKey) {
      return res.json(mockMovers);
    }

    // Fetch daily active stocks as a proxy for high volatility movers
    const response = await fetch(`https://financialmodelingprep.com/api/v3/stock_market/actives?apikey=${apiKey}`);
    if (!response.ok) {
      logger.warn(`FMP API request failed with status ${response.status}. Falling back to mock data.`);
      return res.json(mockMovers);
    }

    const data = await response.json() as any[];
    // Take top 5
    const movers = data.slice(0, 5).map(stock => ({
      symbol: stock.symbol,
      name: stock.name || stock.symbol,
      change: parseFloat(stock.changesPercentage || 0),
      price: parseFloat(stock.price || 0),
      // We can use a simple volatility proxy: absolute percentage change
      volatility: Math.abs(parseFloat(stock.changesPercentage || 0))
    }));

    // Sort by "volatility" (absolute change) descending
    movers.sort((a, b) => b.volatility - a.volatility);

    res.json(movers);
  } catch (err: any) {
    logger.error(`Market Movers fetch failed: ${err.message}. Falling back to mock data.`);
    res.json(mockMovers);
  }
});

// --- Support API ---

// AI Assistant Route (Agentic)
router.post('/support/ai-chat', requireAuth, async (req: AuthRequest, res) => {
    const { message, history, mode } = req.body;
    const userId = req.user!.uid;
    if (!message) return res.status(400).json({ error: 'Missing message' });

    try {
        const responseData = await handleSupportQuery(userId, message, history || [], mode || 'agentic');

        if (responseData.transferToAgent) {
             // Logic to create a ticket automatically if handoff is requested
             const ticketId = 'tkt_' + Math.random().toString(36).substring(2, 10);
             await run('INSERT INTO tickets (id, user_id, subject, status, category, message) VALUES (?, ?, ?, ?, ?, ?)', 
                [ticketId, userId, 'AI Escalation: ' + (responseData.suggestedCategory || 'General'), 'open', responseData.suggestedCategory || 'General', message]);
        }

        res.json(responseData);
    } catch (err: any) {
        logger.error(`Agentic AI Support failed: ${err.message}`);
        res.status(500).json({ error: 'Support service currently unavailable' });
    }
});

// Create Ticket
router.post('/support/tickets', async (req, res) => {
    const { userId, subject, category, message } = req.body;
    if (!userId || !subject || !message) return res.status(400).json({ error: 'Missing required ticket fields' });
    
    try {
        const ticketId = 'tkt_' + Math.random().toString(36).substring(2, 10);
        await run('INSERT INTO tickets (id, user_id, subject, category, message, status) VALUES (?, ?, ?, ?, ?, ?)', 
            [ticketId, userId, subject, category || 'General', message, 'open']);
        
        res.json({ success: true, ticketId });
    } catch (err: any) {
        logger.error(`Failed to create ticket: ${err.message}`);
        res.status(500).json({ error: 'Failed to create ticket' });
    }
});

router.get('/promoMaterials', async (req, res) => {
    res.json([]);
});

router.get('/affiliate_campaigns', async (req, res) => {
    res.json([]);
});

router.get('/affiliate_commissions', async (req, res) => {
    res.json([]);
});

router.get('/affiliate_payouts', async (req, res) => {
    res.json([]);
});

router.get('/affiliate_postbacks', async (req, res) => {
    res.json([]);
});

// Support Tickets List
router.get('/tickets', async (req, res) => {
    try {
        const { status, category, search, assignedAgentId, userId } = req.query as any;
        let sql = 'SELECT * FROM tickets WHERE 1=1';
        const params: any[] = [];

        if (status && status !== 'all') {
          sql += ' AND status = ?';
          params.push(status);
        }
        if (category && category !== 'all') {
          sql += ' AND category = ?';
          params.push(category);
        }
        if (assignedAgentId) {
          sql += ' AND assigned_agent_id = ?';
          params.push(assignedAgentId);
        }
        if (userId) {
          sql += ' AND user_id = ?';
          params.push(userId);
        }
        if (search) {
          sql += ' AND (subject LIKE ? OR message LIKE ? OR user_email LIKE ? OR user_name LIKE ? OR id LIKE ?)';
          const term = `%${search}%`;
          params.push(term, term, term, term, term);
        }

        sql += ' ORDER BY updated_at DESC LIMIT 200';

        const tickets = await query(sql, params);
        res.json(tickets.map(mapTicket));
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/support/tickets', async (req, res) => {
    try {
        const { status, category, search, assignedAgentId, userId } = req.query as any;
        let sql = 'SELECT * FROM tickets WHERE 1=1';
        const params: any[] = [];

        if (status && status !== 'all') {
          sql += ' AND status = ?';
          params.push(status);
        }
        if (category && category !== 'all') {
          sql += ' AND category = ?';
          params.push(category);
        }
        if (assignedAgentId) {
          sql += ' AND assigned_agent_id = ?';
          params.push(assignedAgentId);
        }
        if (userId) {
          sql += ' AND user_id = ?';
          params.push(userId);
        }
        if (search) {
          sql += ' AND (subject LIKE ? OR message LIKE ? OR user_email LIKE ? OR user_name LIKE ? OR id LIKE ?)';
          const term = `%${search}%`;
          params.push(term, term, term, term, term);
        }

        sql += ' ORDER BY updated_at DESC LIMIT 200';

        const tickets = await query(sql, params);
        res.json({ success: true, tickets: tickets.map(mapTicket) });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// Support Chat/Ticket Messages Loader
router.get('/tickets/:ticketId/messages', async (req, res) => {
  const { ticketId } = req.params;
  const role = (req.query.role as string) || 'user';
  const isAgent = role === 'agent' || role === 'admin' || role === 'support';

  try {
    let sql = 'SELECT * FROM ticket_messages WHERE ticket_id = ?';
    if (!isAgent) {
      sql += ' AND (is_internal_note IS NULL OR is_internal_note = 0)';
    }
    sql += ' ORDER BY created_at ASC';

    const messages = await query(sql, [ticketId]);
    res.json(messages.map(mapMessage));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Create/Update Ticket
router.post('/tickets', async (req, res) => {
  const { ticketId, ticketData } = req.body;
  if (!ticketId) return res.status(400).json({ error: 'ticketId is required' });

  try {
    const existing = await get('SELECT id FROM tickets WHERE id = ?', [ticketId]);
    if (existing) {
      const updates: string[] = [];
      const params: any[] = [];
      
      const fieldMap: { [key: string]: string } = {
        lastMessage: 'last_message',
        status: 'status',
        priority: 'priority',
        category: 'category',
        assignedAgentId: 'assigned_agent_id',
        assignedAgentName: 'assigned_agent_name',
        assignedAgentEmail: 'assigned_agent_email',
        updatedAt: 'updated_at',
      };

      for (const [key, value] of Object.entries(ticketData)) {
        const dbField = fieldMap[key];
        if (dbField && value !== undefined) {
          updates.push(`${dbField} = ?`);
          params.push(value);
        }
      }

      if (updates.length > 0) {
        params.push(ticketId);
        await run(`UPDATE tickets SET ${updates.join(', ')} WHERE id = ?`, params);
      }
    } else {
      const userId = ticketData.userId || 'guest';
      const userName = ticketData.userName || 'Trader';
      const userEmail = ticketData.userEmail || 'user@Bivaax.trade';
      const subject = ticketData.subject || 'Support Query';
      const category = ticketData.category || 'General';
      const message = ticketData.message || '';
      const lastMessage = ticketData.lastMessage || message;
      const status = ticketData.status || 'open';
      const priority = ticketData.priority || 'medium';
      const createdAt = ticketData.createdAt || Date.now();
      const updatedAt = ticketData.updatedAt || Date.now();
      
      await run(
        `INSERT INTO tickets (id, user_id, user_name, user_email, subject, category, message, last_message, status, priority, updated_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [ticketId, userId, userName, userEmail, subject, category, message, lastMessage, status, priority, updatedAt, createdAt]
      );
    }

    const updated = await get('SELECT * FROM tickets WHERE id = ?', [ticketId]);
    const mappedTicket = mapTicket(updated);
    try {
      const io = getIO();
      io.to(`user_${mappedTicket.userId}`).emit('ticket_updated', mappedTicket);
      io.to('agents_room').emit('ticket_updated', mappedTicket);
      io.to(`ticket_${ticketId}`).emit('ticket_updated', mappedTicket);
    } catch (e) {}
    res.json({ success: true, ticket: mappedTicket });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Add Message to Support Chat
router.post('/tickets/messages', async (req, res) => {
  const { ticketId, messageId, messageData } = req.body;
  if (!ticketId || !messageId) {
    return res.status(400).json({ error: 'ticketId and messageId are required' });
  }

  try {
    const userId = messageData.senderId || 'unknown';
    const senderType = messageData.senderType || (messageData.senderId === 'support' || messageData.isAdmin ? 'agent' : 'user');
    const senderName = messageData.senderName || (senderType === 'agent' ? 'Support Agent' : senderType === 'bot' ? 'Bivaax AI Assistant' : 'User');
    const text = messageData.text || messageData.message || '';
    const attachments = messageData.attachments ? JSON.stringify(messageData.attachments) : null;
    const isInternalNote = messageData.isInternalNote ? 1 : 0;
    const isAdmin = senderType === 'agent' || senderType === 'bot' || messageData.isAdmin ? 1 : 0;
    const createdAt = messageData.createdAt || Date.now();

    await run(
      `INSERT INTO ticket_messages (id, ticket_id, user_id, sender_type, sender_name, message, attachments, is_internal_note, is_admin, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [messageId, ticketId, userId, senderType, senderName, text, attachments, isInternalNote, isAdmin, createdAt]
    );

    // Update main ticket last_message & updated_at if not internal note
    if (!isInternalNote) {
      const ticket = await get('SELECT first_response_at, status FROM tickets WHERE id = ?', [ticketId]) as any;
      let extraCols = '';
      const extraParams: any[] = [];

      if (senderType === 'agent' && ticket && !ticket.first_response_at) {
        extraCols += ', first_response_at = ?';
        extraParams.push(createdAt);
      }
      if (senderType === 'agent' && ticket?.status === 'open') {
        extraCols += ", status = 'in_progress'";
      }

      await run(
        `UPDATE tickets SET last_message = ?, updated_at = ? ${extraCols} WHERE id = ?`,
        [text, createdAt, ...extraParams, ticketId]
      );
    }

    const inserted = await get('SELECT * FROM ticket_messages WHERE id = ?', [messageId]);
    const mappedMsg = mapMessage(inserted);

    // Send Email Notification if Agent Replied
    if (senderType === 'agent') {
      try {
        const ticket = await get('SELECT * FROM tickets WHERE id = ?', [ticketId]) as any;
        if (ticket && ticket.user_email) {
          await sendEmail(
            ticket.user_email,
            `New Reply: ${ticket.subject}`,
            `<div style="font-family: sans-serif; max-w: 600px; margin: 0 auto; background-color: #f9f9f9; padding: 20px;">
              <div style="background-color: #1a1b23; padding: 30px; border-radius: 10px; color: white; text-align: center;">
                <h2 style="margin: 0; color: #FFE24C;">Support Ticket Update</h2>
              </div>
              <div style="padding: 30px; background-color: white; border-radius: 0 0 10px 10px; border: 1px solid #eee;">
                <p>Hello,</p>
                <p>A support agent has replied to your ticket: <strong>"${ticket.subject}"</strong></p>
                <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; font-style: italic; color: #333; border-left: 4px solid #FFE24C;">
                  "${text}"
                </div>
                <p>Please log in to the Bivaax Trade terminal to continue the conversation.</p>
                <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
                <p style="font-size: 12px; color: #999; text-align: center;">Bivaax Trade Support Team</p>
              </div>
            </div>`
          );
        }
      } catch (e) {}
    }

    try {
      const io = getIO();
      io.to(`ticket_${ticketId}`).emit('support_message', mappedMsg);
      const ticketRow = await get('SELECT * FROM tickets WHERE id = ?', [ticketId]);
      if (ticketRow) {
        const mappedT = mapTicket(ticketRow);
        io.to(`user_${mappedT.userId}`).emit('ticket_updated', mappedT);
        io.to('agents_room').emit('ticket_updated', mappedT);
      }
    } catch (e) {
      console.warn('Socket emit warning:', e);
    }

    res.json({ success: true, message: mappedMsg });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Update Ticket Status / Assignment
router.patch('/support/tickets/:ticketId/status', async (req, res) => {
  const { ticketId } = req.params;
  const { status, priority, category, assignedAgentId, assignedAgentName, assignedAgentEmail } = req.body;

  try {
    const updates: string[] = ['updated_at = ?'];
    const params: any[] = [Date.now()];

    if (status) {
      updates.push('status = ?');
      params.push(status);
      if (status === 'resolved') {
        updates.push('resolved_at = ?');
        params.push(Date.now());
      } else if (status === 'closed') {
        updates.push('closed_at = ?');
        params.push(Date.now());
      }
    }
    if (priority) {
      updates.push('priority = ?');
      params.push(priority);
    }
    if (category) {
      updates.push('category = ?');
      params.push(category);
    }
    if (assignedAgentId !== undefined) {
      updates.push('assigned_agent_id = ?');
      params.push(assignedAgentId);
    }
    if (assignedAgentName !== undefined) {
      updates.push('assigned_agent_name = ?');
      params.push(assignedAgentName);
    }
    if (assignedAgentEmail !== undefined) {
      updates.push('assigned_agent_email = ?');
      params.push(assignedAgentEmail);
    }

    params.push(ticketId);
    await run(`UPDATE tickets SET ${updates.join(', ')} WHERE id = ?`, params);

    // Insert system message in chat
    if (status) {
      const msgId = `SYS-${Date.now()}`;
      await run(
        `INSERT INTO ticket_messages (id, ticket_id, user_id, sender_type, sender_name, message, is_admin, created_at)
         VALUES (?, ?, 'system', 'system', 'System', ?, 1, ?)`,
        [msgId, ticketId, `Ticket status changed to: ${status.toUpperCase()}`, Date.now()]
      );
    }

    const updated = await get('SELECT * FROM tickets WHERE id = ?', [ticketId]);
    res.json({ success: true, ticket: mapTicket(updated) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// CSAT Rating
router.post('/support/tickets/:ticketId/rate', async (req, res) => {
  const { ticketId } = req.params;
  const { rating, feedback } = req.body;

  try {
    await run(
      `UPDATE tickets SET rating = ?, rating_feedback = ?, updated_at = ? WHERE id = ?`,
      [rating, feedback || '', Date.now(), ticketId]
    );
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Legacy Support Bot Endpoint - Deprecated in favor of /support/ai-chat
router.post('/support/reply', async (req, res) => {
  res.status(410).json({ error: 'This endpoint is deprecated. Use /support/ai-chat instead.' });
});

// User 360° Support Context Endpoint for Agents
router.get('/support/user-context/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    const user = await get('SELECT * FROM users WHERE uid = ? OR id = ?', [userId, userId]) as any;
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const uid = user.uid;

    // Fetch transactions (deposits & withdrawals)
    const deposits = await query(
      "SELECT * FROM transactions WHERE user_id = ? AND type = 'deposit' ORDER BY created_at DESC LIMIT 5",
      [uid]
    );
    const withdrawals = await query(
      "SELECT * FROM transactions WHERE user_id = ? AND type = 'withdrawal' ORDER BY created_at DESC LIMIT 5",
      [uid]
    );

    // Fetch trades
    const recentTrades = await query(
      'SELECT * FROM trades WHERE user_id = ? ORDER BY created_at DESC LIMIT 5',
      [uid]
    );
    const tradeStats = await get(
      'SELECT COUNT(*) as total, SUM(CASE WHEN status = \'won\' OR status = \'win\' THEN 1 ELSE 0 END) as wins, SUM(amount) as volume FROM trades WHERE user_id = ?',
      [uid]
    ) as any;

    const totalTrades = tradeStats?.total || 0;
    const winTrades = tradeStats?.wins || 0;
    const winRate = totalTrades > 0 ? Math.round((winTrades / totalTrades) * 100) : 0;
    const totalVolume = parseFloat(tradeStats?.volume || 0);

    res.json({
      profile: {
        uid: user.uid,
        email: user.email,
        displayName: user.display_name || 'Trader',
        phone: user.phone || 'N/A',
        country: user.country || 'International',
        kycStatus: user.kyc_status || 'unverified',
        realBalance: parseFloat(user.real_balance || 0),
        demoBalance: parseFloat(user.demo_balance || 10000),
        createdAt: user.created_at,
        status: user.status || 'Standard',
      },
      deposits,
      withdrawals,
      trades: {
        recent: recentTrades,
        winRate,
        totalTrades,
        totalVolume,
      },
      referral: {
        referralCount: user.referral_count || 0,
        affiliateBalance: parseFloat(user.affiliate_balance || 0),
        totalEarnings: parseFloat(user.total_affiliate_earnings || 0),
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Canned Responses Endpoints
router.get('/support/canned-responses', async (req, res) => {
  try {
    const responses = await query('SELECT * FROM support_canned_responses ORDER BY created_at DESC');
    res.json(responses);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/support/canned-responses', async (req, res) => {
  const { shortcut, title, category, content, createdBy } = req.body;
  if (!shortcut || !title || !content) {
    return res.status(400).json({ error: 'shortcut, title, and content are required' });
  }

  try {
    const id = `CR-${Date.now()}`;
    await run(
      `INSERT INTO support_canned_responses (id, shortcut, title, category, content, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, shortcut, title, category || 'General', content, createdBy || 'admin', Date.now()]
    );
    res.json({ success: true, id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Support Analytics Endpoint
router.get('/support/analytics', async (req, res) => {
  try {
    const totals = await get(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) as open_cnt,
        SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_prog_cnt,
        SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) as resolved_cnt,
        SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) as closed_cnt,
        AVG(rating) as avg_rating
      FROM tickets
    `) as any;

    const categories = await query(`
      SELECT category, COUNT(*) as count FROM tickets GROUP BY category
    `);

    const catBreakdown: any = {};
    categories.forEach((c: any) => {
      catBreakdown[c.category || 'General'] = c.count;
    });

    res.json({
      totalTickets: totals?.total || 0,
      openTickets: totals?.open_cnt || 0,
      inProgressTickets: totals?.in_prog_cnt || 0,
      resolvedTickets: totals?.resolved_cnt || 0,
      closedTickets: totals?.closed_cnt || 0,
      avgFirstResponseMinutes: 2.5,
      avgResolutionHours: 1.2,
      csatAverage: totals?.avg_rating ? parseFloat(totals.avg_rating.toFixed(1)) : 4.8,
      handoffRatePercent: 18,
      categoryBreakdown: catBreakdown,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

import { processCopyTrading } from '../services/copyTradingService.ts';
import { settleTrade } from '../services/tradeService.ts';
import { createDeposit } from '../services/gopayService.ts';

// 10. Trade Placement (Compatibility with frontend)
router.post('/trade', async (req, res) => {
  const { pair, amount, direction, accountType, userId, tournamentId, trade } = req.body;
  if (!userId || !pair || !amount) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const isDemo = accountType === 'demo';
  const isTournament = accountType === 'tournament';

  try {
    await transaction(async (conn) => {
      // 1. Check user balance
      let currentBalance = new Big(0);
      let balanceField = 'real_balance';

      if (isTournament) {
        if (!tournamentId) throw new Error('Tournament ID is required for tournament trades');
        const participant = await get('SELECT score FROM tournament_participants WHERE tournament_id = ? AND user_id = ?', [tournamentId, userId], conn) as any;
        if (!participant) throw new Error('User is not joined in this tournament');
        currentBalance = new Big(participant.score || 0);
      } else {
        const user = await get('SELECT real_balance, demo_balance FROM users WHERE uid = ?', [userId], conn) as any;
        if (!user) throw new Error('User not found');
        balanceField = isDemo ? 'demo_balance' : 'real_balance';
        currentBalance = new Big(user[balanceField] || 0);
      }

      const tradeAmount = new Big(amount);
      if (currentBalance.lt(tradeAmount)) {
        throw new Error('Insufficient balance');
      }

      // 2. Deduct balance
      const newBalanceStr = currentBalance.minus(tradeAmount).toFixed(2);
      if (isTournament) {
        await run(`UPDATE tournament_participants SET score = ? WHERE tournament_id = ? AND user_id = ?`, [newBalanceStr, tournamentId, userId], conn);
        // Sync tournament score to Firestore
        const { syncTournamentScoreToFirestore } = await import('../lib/firebase-admin.ts');
        syncTournamentScoreToFirestore(tournamentId as string, userId, parseFloat(newBalanceStr)).catch(e => logger.error('Sync tournament balance failed:', e));
      } else {
        await run(`UPDATE users SET ${balanceField} = ? WHERE uid = ?`, [newBalanceStr, userId], conn);
      }

      // 3. Insert trade
      const entryPrice = trade?.entryPrice || 0;
      const duration = trade?.timeLeft || 60;
      const expiryTime = Math.floor((Date.now() + duration * 1000) / 1000);
      const createdAt = Date.now();

      const insertRes = await run(
        `INSERT INTO trades (user_id, market_id, amount, direction, entry_price, duration, expiry_time, is_demo, status, account_type, tournament_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, pair, amount.toString(), direction, entryPrice.toString(), duration, expiryTime, isDemo ? 1 : 0, 'open', accountType || (isDemo ? 'demo' : 'real'), tournamentId || null, createdAt],
        conn
      );
      
      const tradeId = (insertRes as any).lastInsertRowid;

      // Sync new trade to Firestore
      if (adminDb) {
        try {
          const mappedTrade = {
            id: tradeId.toString(),
            userId,
            marketId: pair,
            asset: pair,
            amount: parseFloat(amount.toString()),
            direction,
            type: direction,
            entryPrice: parseFloat(entryPrice.toString()),
            status: 'open',
            duration,
            expiryTime,
            accountType: accountType || (isDemo ? 'demo' : 'real'),
            isDemo,
            tournamentId: tournamentId || null,
            createdAt: createdAt,
            payoutRate: trade?.payoutRate || 80
          };
          await adminDb.collection('trades').doc(tradeId.toString()).set(mappedTrade);
        } catch (e: any) {
          logger.error(`Failed to sync new trade ${tradeId} to Firestore: ${e.message}`);
        }
      }

      // 4. Create Audit Log if not demo
      if (!isDemo) {
        await createAuditLog(userId, 'trade_place', 'trade', null, { pair, amount, direction, entryPrice });
      }

      // 5. Notify user of balance update via Socket.IO
      const updatedUser = await get('SELECT * FROM users WHERE uid = ?', [userId], conn) as any;
      const mapped = mapUserForFrontend(updatedUser);
      getIO().to(`user_${userId}`).emit('user_profile_update', mapped);
      syncUserToFirestore(userId, mapped);
      
      // 6. Trigger Copy Trading
      processCopyTrading(userId, {
        marketId: pair,
        amount: parseFloat(amount.toString()),
        direction,
        entryPrice: parseFloat(entryPrice.toString()),
        duration,
        isDemo,
        tradeId
      }).catch(err => logger.error('Copy trading trigger failed:', err));

      return { id: tradeId, createdAt };
    });

    const insertedTrade = await get('SELECT * FROM trades WHERE user_id = ? ORDER BY id DESC LIMIT 1', [userId]);
    res.json({ success: true, trade: mapTrade(insertedTrade) });
  } catch (err: any) {
    logger.error(`Trade placement failed: ${err.message}`);
    res.status(400).json({ error: err.message });
  }
});

router.post('/trade/settle-secure', async (req, res) => {
  const { tradeId, currentMarketPrice } = req.body;
  if (!tradeId) return res.status(400).json({ error: 'tradeId is required' });
  
  try {
    const result = await settleTrade(Number(tradeId), currentMarketPrice);
    res.json({ success: true, trade: result });
  } catch (error: any) {
    logger.error(`Manual settlement failed for trade ${tradeId}: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

router.get('/masterTraders', async (req, res) => {
  try {
    const traders = await query('SELECT * FROM master_traders');
    if (!traders || traders.length === 0) {
      // Return dummy master traders for compatibility
      return res.json([
        { id: 'm1', displayName: 'ProTrader_Alpha', name: 'ProTrader_Alpha', winRate: 84.5, profit: 12450.0, followers: 1240 },
        { id: 'm2', displayName: 'Binomo_Legend', name: 'Binomo_Legend', winRate: 79.2, profit: 8920.0, followers: 850 },
        { id: 'm3', displayName: 'Crypto_Wizard', name: 'Crypto_Wizard', winRate: 91.0, profit: 15600.0, followers: 2100 }
      ]);
    }
    res.json(traders);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load master traders' });
  }
});

router.post('/masterTraders', async (req, res) => {
  try {
    const data = req.body;
    const id = data.id || `m_${Date.now()}`;
    await run(
      `INSERT INTO master_traders (id, name, country, win_rate, profit, followers) VALUES (?, ?, ?, ?, ?, ?)`,
      [id, data.name || '', data.country || '', data.winRate || 0, data.totalProfit || 0, data.copiersCount || 0]
    );
    res.json({ id });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create master trader' });
  }
});

router.get('/users/:uid/activeCopies', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (req.user?.uid !== req.params.uid && !req.user?.isAdmin) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    const copies = await query('SELECT * FROM active_copies WHERE user_id = ? ORDER BY started_at DESC', [req.params.uid]);
    res.json(copies || []);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load active copies' });
  }
});

router.post('/users/:uid/activeCopies', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (req.user?.uid !== req.params.uid && !req.user?.isAdmin) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    const data = req.body;
    const id = data.id || `copy_${Date.now()}`;
    
    await run(
      `INSERT INTO active_copies 
      (id, user_id, master_id, master_name, country, amount, max_trade_amount, trades_limit, stop_loss, take_profit, started_at) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, req.params.uid, data.masterId, data.masterName, data.country || '',
        data.amount || 0, data.maxTradeAmount || 10, data.tradesLimit || 0, data.stopLoss || 0, data.takeProfit || 0, Date.now()
      ]
    );
    res.json({ id });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create active copy' });
  }
});

router.patch('/masterTraders/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const data = req.body;
    if (data.copiersCount) {
      // Handle increment
      if (typeof data.copiersCount === 'object' && data.copiersCount.increment !== undefined) {
         await run('UPDATE master_traders SET followers = followers + ? WHERE id = ?', [data.copiersCount.increment, req.params.id]);
      } else if (typeof data.copiersCount === 'number') {
         await run('UPDATE master_traders SET followers = followers + ? WHERE id = ?', [data.copiersCount, req.params.id]);
      }
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update master trader' });
  }
});

import { fetchLeaderboards } from '../services/leaderboardService.ts';

router.get('/leaderboard', async (req, res) => {
  try {
    const data = await fetchLeaderboards();
    res.json(data);
  } catch (err: any) {
    console.error('API Error: Failed to fetch leaderboard data', err);
    res.status(500).json({ error: 'Failed to fetch leaderboard data' });
  }
});

router.delete('/users/:uid/activeCopies/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (req.user?.uid !== req.params.uid && !req.user?.isAdmin) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    await run('DELETE FROM active_copies WHERE id = ? AND user_id = ?', [req.params.id, req.params.uid]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete active copy' });
  }
});

router.post('/copy-trade/start', requireAuth, async (req: AuthRequest, res) => {
  res.json({ success: true, message: 'Copy trading started' });
});

// Validation middleware
const validate = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

// --- Wallet & Profile ---

router.get('/user/profile', requireAuth, async (req: AuthRequest, res) => {
  const user = await get('SELECT * FROM users WHERE uid = ?', [req.user!.uid]);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(mapUserForFrontend(user));
});

router.get('/wallet/balance', requireAuth, async (req: AuthRequest, res) => {
  const user = await get('SELECT * FROM users WHERE uid = ?', [req.user!.uid]) as any;
  res.json(mapUserForFrontend(user));
});

// --- Trades ---

router.get('/trades/history', requireAuth, async (req: AuthRequest, res) => {
  const { isDemo, limit = 50 } = req.query;
  const history = await query(
    `SELECT * FROM trades WHERE user_id = ? AND is_demo = ? ORDER BY created_at DESC LIMIT ?`,
    [req.user!.uid, isDemo === 'true' ? 1 : 0, Number(limit)]
  );
  res.json(history);
});

router.get('/user-trades', async (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: 'userId is required' });
  try {
    const trades = await query('SELECT * FROM trades WHERE user_id = ? ORDER BY created_at DESC LIMIT 200', [userId]);
    res.json({ success: true, trades: (trades as any[]).map(mapTrade) });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/trades/place', 
  requireAuth,
  body('marketId').isString().notEmpty(),
  body('amount').isNumeric().toFloat(),
  body('direction').isIn(['up', 'down']),
  body('duration').isInt({ min: 1 }),
  body('entryPrice').isNumeric().toFloat(),
  validate,
  async (req: AuthRequest, res) => {
    const { marketId, amount, direction, duration, entryPrice, isDemo, accountType, tournamentId } = req.body;
  const uid = req.user!.uid;

  const nowSec = Math.floor(Date.now() / 1000);
  if (isMarketClosedAt(marketId, nowSec)) {
    return res.status(400).json({ error: 'Market is closed. Trading is suspended.' });
  }

  try {
    await transaction(async (conn) => {
      // 1. Check balance with lock
      const user = await get('SELECT real_balance, demo_balance FROM users WHERE uid = ?', [uid], conn) as any;
      
      let currentBalance;
      const isTournament = accountType === 'tournament' && tournamentId;
      
      if (isTournament) {
        const participant = await get('SELECT score FROM tournament_participants WHERE tournament_id = ? AND user_id = ?', [tournamentId, uid], conn) as any;
        if (!participant) throw new Error('Not joined in this tournament');
        currentBalance = new Big(participant.score || 0);
      } else {
        const balanceField = (isDemo || accountType === 'demo') ? 'demo_balance' : 'real_balance';
        currentBalance = new Big(user[balanceField] || 0);
      }
      
      const tradeAmount = new Big(amount);

      if (currentBalance.lt(tradeAmount)) {
        throw new Error('Insufficient balance');
      }

      // 2. Deduct balance
      const newBalance = currentBalance.minus(tradeAmount).toFixed(2);
      if (isTournament) {
        await run(`UPDATE tournament_participants SET score = ? WHERE tournament_id = ? AND user_id = ?`, [newBalance, tournamentId, uid], conn);
      } else {
        const balanceField = (isDemo || accountType === 'demo') ? 'demo_balance' : 'real_balance';
        await run(`UPDATE users SET ${balanceField} = ? WHERE uid = ?`, [newBalance, uid], conn);
      }

      // 3. Insert trade
      const now = Date.now();
      const expiryTime = Math.floor((now + duration * 1000) / 1000);
      await run(
        `INSERT INTO trades (user_id, market_id, amount, direction, entry_price, duration, expiry_time, is_demo, status, account_type, tournament_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [uid, marketId, amount.toString(), direction, entryPrice.toString(), duration, expiryTime, (isDemo || accountType === 'demo') ? 1 : 0, 'open', accountType || (isDemo ? 'demo' : 'real'), isTournament ? tournamentId : null, now],
        conn
      );

      const inserted = await get('SELECT id, created_at FROM trades WHERE user_id = ? ORDER BY id DESC LIMIT 1', [uid], conn) as any;
      if (inserted && adminDb) {
        try {
          await adminDb.collection('trades').doc(inserted.id.toString()).set({
            userId: uid,
            marketId,
            amount: parseFloat(amount.toString()),
            direction,
            entryPrice: parseFloat(entryPrice.toString()),
            exitPrice: null,
            duration,
            expiryTime,
            isDemo: isDemo ? 1 : 0,
            status: 'open',
            payoutAmount: 0,
            settledAt: null,
            createdAt: inserted.created_at || Date.now()
          });
        } catch (fsErr: any) {
          logger.warn(`Failed to sync trade ${inserted.id} creation to Firestore: ${fsErr.message}`);
        }
      }

      if (!isDemo) {
        await createAuditLog(uid, 'trade_place', 'trade', null, { marketId, amount, direction, entryPrice });
      }

      // Notify balance update
      const updatedUser = await get('SELECT * FROM users WHERE uid = ?', [uid], conn) as any;
      const mapped = mapUserForFrontend(updatedUser);
      getIO().to(`user_${uid}`).emit('user_profile_update', mapped);
      syncUserToFirestore(uid, mapped);

      // Trigger Copy Trading
      processCopyTrading(uid, {
        marketId,
        direction,
        duration,
        entryPrice,
        isDemo
      }).catch(err => logger.error('Copy trading trigger failed:', err));
    });

    const trade = await get('SELECT * FROM trades WHERE user_id = ? ORDER BY id DESC LIMIT 1', [uid]);
    res.json(trade);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// --- Transactions (Deposit/Withdraw) ---

router.post('/wallet/deposit', 
  requireAuth,
  body('amount').isNumeric().toFloat(),
  body('method').isString().notEmpty(),
  body('txHash').optional().isString(),
  validate,
  async (req: AuthRequest, res) => {
    const { amount, method, txHash, trxId, currency, walletNumber, orderId, userEmail } = req.body;
    const uid = req.user!.uid;
    const finalTxHash = trxId || txHash || '';
    const finalCurrency = currency || 'BDT';

    await run(
      `INSERT INTO transactions (user_id, type, amount, status, method, tx_hash, currency, details, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uid, 
        'deposit', 
        amount.toString(), 
        'pending', 
        method, 
        finalTxHash, 
        finalCurrency, 
        JSON.stringify({ walletNumber, orderId }),
        Date.now()
      ]
    );

    if (adminDb) {
      try {
        await adminDb.collection('deposits').add({
          userId: uid,
          userEmail: userEmail || req.user?.email || '',
          amount: Number(amount),
          currency: finalCurrency,
          method: method,
          walletNumber: walletNumber || '',
          trxId: finalTxHash,
          status: 'pending',
          timestamp: Date.now(),
          orderId: orderId || ''
        });
        logger.info(`Deposit request successfully written to Firestore deposits collection for user ${uid}`);
      } catch (firestoreErr: any) {
        logger.error(`Error writing deposit to Firestore: ${firestoreErr.message}`);
      }
    }

    await createAuditLog(uid, 'deposit_request', 'transaction', null, { amount, method, txHash: finalTxHash }, req.ip);
    logger.info(`Deposit request from ${uid}: ${amount}`);

    // Send Deposit Requested Email
    try {
      const user = await get('SELECT email, display_name FROM users WHERE uid = ?', [uid]) as any;
      if (user && user.email) {
        const subject = 'Deposit Request Received - Bivaax Trade';
        const html = `
          <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-w: 600px; margin: 0 auto; background-color: #f4f7f9; padding: 20px;">
            <div style="background-color: #1a1b23; padding: 30px; border-radius: 12px 12px 0 0; color: white; text-align: center;">
              <h2 style="color: #FFE24C; margin: 0;">Deposit Request Received</h2>
            </div>
            <div style="padding: 40px; background-color: white; border-radius: 0 0 12px 12px; border: 1px solid #e1e8ed;">
              <p>Hello ${user.display_name || 'Trader'},</p>
              <p>Your deposit request has been successfully submitted and is currently pending review.</p>
              
              <div style="background-color: #f8fafc; border-radius: 8px; padding: 20px; margin: 25px 0;">
                <table style="width: 100%; font-size: 14px;">
                  <tr><td style="color: #64748b; padding: 5px 0;">Amount:</td><td style="color: #1e293b; font-weight: bold; text-align: right;">${amount} ${finalCurrency}</td></tr>
                  <tr><td style="color: #64748b; padding: 5px 0;">Method:</td><td style="color: #1e293b; font-weight: bold; text-align: right;">${method}</td></tr>
                  <tr><td style="color: #64748b; padding: 5px 0;">Status:</td><td style="color: #f59e0b; font-weight: bold; text-align: right;">Pending</td></tr>
                </table>
              </div>

              <p style="font-size: 14px; color: #64748b; line-height: 1.6;">Our team will process your deposit once the transaction is confirmed on the network. This typically takes 5-30 minutes.</p>
              
              <hr style="border: 0; border-top: 1px solid #edf2f7; margin: 30px 0;">
              <p style="font-size: 12px; color: #94a3b8; text-align: center;">Bivaax Trade Financial Services</p>
            </div>
          </div>
        `;
        await sendEmail(user.email, subject, html);
      }
    } catch (e: any) {
      logger.error(`Failed to send deposit request email: ${e.message}`);
    }

    res.json({ success: true, message: 'Deposit request submitted' });
  }
);

router.post('/wallet/withdraw', 
  requireAuth,
  body('amount').isNumeric().toFloat(),
  body('method').isString().notEmpty(),
  body('details').isObject(),
  validate,
  async (req: AuthRequest, res) => {
    const { amount, method, details } = req.body;
  const uid = req.user!.uid;

  try {
    await transaction(async (conn) => {
      const user = await get('SELECT real_balance FROM users WHERE uid = ?', [uid], conn) as any;
      const currentBalance = new Big(user.real_balance || 0);
      const withdrawAmount = new Big(amount);

      if (currentBalance.lt(withdrawAmount)) {
        throw new Error('Insufficient balance');
      }

      // Deduct balance immediately for withdrawal
      const newBalance = currentBalance.minus(withdrawAmount).toFixed(2);
      await run(`UPDATE users SET real_balance = ? WHERE uid = ?`, [newBalance, uid], conn);
      
      const updatedUser = await get('SELECT * FROM users WHERE uid = ?', [uid], conn) as any;
      const mapped = mapUserForFrontend(updatedUser);
      getIO().to(`user_${uid}`).emit('user_profile_update', mapped);
      syncUserToFirestore(uid, mapped);

      await run(
        `INSERT INTO transactions (user_id, type, amount, status, method, details)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [uid, 'withdrawal', amount.toString(), 'pending', method, JSON.stringify(details)]
      );
      
      await createAuditLog(uid, 'withdraw_request', 'transaction', null, { amount, method }, req.ip);
    });

    if (adminDb) {
      try {
        await adminDb.collection('withdrawals').add({
          userId: uid,
          userEmail: req.user?.email || '',
          amount: Number(amount),
          method: method,
          details: details,
          status: 'pending',
          timestamp: Date.now(),
          createdAt: Date.now()
        });
        logger.info(`Withdrawal request successfully written to Firestore withdrawals collection for user ${uid}`);
      } catch (firestoreErr: any) {
        logger.error(`Error writing withdrawal to Firestore: ${firestoreErr.message}`);
      }
    }

    logger.info(`Withdrawal request from ${uid}: ${amount}`);

    // Send Withdrawal Requested Email
    try {
      const user = await get('SELECT email, display_name FROM users WHERE uid = ?', [uid]) as any;
      if (user && user.email) {
        const subject = 'Withdrawal Request Received - Bivaax Trade';
        const html = `
          <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-w: 600px; margin: 0 auto; background-color: #f4f7f9; padding: 20px;">
            <div style="background-color: #1a1b23; padding: 30px; border-radius: 12px 12px 0 0; color: white; text-align: center;">
              <h2 style="color: #FFE24C; margin: 0;">Withdrawal Request Received</h2>
            </div>
            <div style="padding: 40px; background-color: white; border-radius: 0 0 12px 12px; border: 1px solid #e1e8ed;">
              <p>Hello ${user.display_name || 'Trader'},</p>
              <p>We have received your request to withdraw funds from your Bivaax Trade account.</p>
              
              <div style="background-color: #f8fafc; border-radius: 8px; padding: 20px; margin: 25px 0;">
                <table style="width: 100%; font-size: 14px;">
                  <tr><td style="color: #64748b; padding: 5px 0;">Amount:</td><td style="color: #1e293b; font-weight: bold; text-align: right;">${amount}</td></tr>
                  <tr><td style="color: #64748b; padding: 5px 0;">Method:</td><td style="color: #1e293b; font-weight: bold; text-align: right;">${method}</td></tr>
                  <tr><td style="color: #64748b; padding: 5px 0;">Status:</td><td style="color: #f59e0b; font-weight: bold; text-align: right;">Pending Review</td></tr>
                </table>
              </div>

              <p style="font-size: 14px; color: #64748b; line-height: 1.6;">Withdrawal requests are processed within 24 hours. You will receive another notification once your funds have been sent.</p>
              <p style="font-size: 14px; color: #64748b; line-height: 1.6;">If you did not request this withdrawal, please contact our security team immediately.</p>
              
              <hr style="border: 0; border-top: 1px solid #edf2f7; margin: 30px 0;">
              <p style="font-size: 12px; color: #94a3b8; text-align: center;">Bivaax Trade Security Center</p>
            </div>
          </div>
        `;
        await sendEmail(user.email, subject, html);
      }
    } catch (e: any) {
      logger.error(`Failed to send withdrawal request email: ${e.message}`);
    }

    res.json({ success: true, message: 'Withdrawal request submitted' });

  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/wallet/transactions', requireAuth, async (req: AuthRequest, res) => {
  await syncUserTransactions(req.user!.uid);
  const history = await query(
    `SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`,
    [req.user!.uid]
  );
  res.json(history);
});

// GoPay Payment Routes
router.post('/payment/collect', requireAuth, async (req: AuthRequest, res) => {
  const { amount, payType } = req.body;
  const uid = req.user!.uid;
  const orderId = `DEP_${Date.now()}_${uid}`;

  try {
      const response = await createDeposit(amount, orderId, payType);
      res.json({ success: true, url: response.data.data.url });
  } catch (err: any) {
      logger.error(`GoPay collect failed: ${err.message}`);
      res.status(500).json({ error: err.message });
  }
});

router.post('/payment/webhook', async (req, res) => {
    // Note: Signature verification should be added here for production security
    const { status, out_trade_no, money } = req.body;
    
    if (status == 1) { // Assuming status 1 is success based on typical gateway patterns
        const uid = out_trade_no.split('_')[2];
        await run(`UPDATE transactions SET status = 'completed' WHERE user_id = ? AND amount = ? AND status = 'pending'`, [uid, money]);
        
        // Update balance precisely
        const user = await get('SELECT real_balance FROM users WHERE uid = ?', [uid]) as any;
        if (user) {
          const currentBalance = new Big(user.real_balance || 0);
          const depositAmount = new Big(money);
          const newBalance = currentBalance.plus(depositAmount).toFixed(2);
          await run('UPDATE users SET real_balance = ? WHERE uid = ?', [newBalance, uid]);
          
          const mapped = mapUserForFrontend(await get('SELECT * FROM users WHERE uid = ?', [uid]));
          getIO().to(`user_${uid}`).emit('user_profile_update', mapped);
          syncUserToFirestore(uid, mapped);
        }
    }
    
    res.status(200).send('success');
});

// Admin Panel - Add Generic Collection Handler
router.post('/depositMethods', requireAuth, async (req: AuthRequest, res) => {
    try {
        const docRef = await adminDb.collection('depositMethods').add(req.body);
        res.json({ id: docRef.id });
    } catch (e: any) {
        logger.error(`Error adding depositMethod: ${e.message}`);
        res.status(500).json({ error: e.message });
    }
});

// Generic handler for proxy addDoc calls

router.post('/admin/deposits/update', requireAuth, async (req: AuthRequest, res) => {
  if (!req.user?.isAdmin) return res.status(403).json({ error: 'Admin only' });
  const { id, status, userId, finalAmountInBase } = req.body;

  try {
    if (!adminDb) {
      return res.status(500).json({ error: 'Firestore is not initialized.' });
    }

    // Check if the deposit transaction has already been processed
    let depositDoc = null;
    let depositData: any = {};
    try {
      depositDoc = await adminDb.collection('deposits').doc(id).get();
    } catch (e: any) {
      logger.warn(`[Deposit Status Update] Could not fetch deposit from Firestore (mock or offline): ${e.message}`);
    }

    if (depositDoc && depositDoc.exists) {
      depositData = depositDoc.data() || {};
      if (depositData?.processedByServer === true) {
        return res.status(400).json({ error: 'This deposit has already been processed.' });
      }
    } else {
      logger.info(`[Deposit Status Update] Deposit ID ${id} not found in Firestore. Proceeding in offline/fallback mode.`);
    }

    // SQLite double-spend / duplicate crediting safety check
    let isAlreadyProcessedInSql = false;
    let sqlTx = await get('SELECT * FROM transactions WHERE user_id = ? AND details LIKE ?', [userId, `%${id}%`]) as any;
    if (!sqlTx && depositData?.orderId) {
      sqlTx = await get('SELECT * FROM transactions WHERE user_id = ? AND details LIKE ?', [userId, `%${depositData.orderId}%`]) as any;
    }
    if (!sqlTx && depositData?.trxId) {
      sqlTx = await get('SELECT * FROM transactions WHERE user_id = ? AND tx_hash = ?', [userId, depositData.trxId]) as any;
    }
    if (sqlTx && (sqlTx.status === 'completed' || sqlTx.status === 'success' || sqlTx.status === 'approved')) {
      isAlreadyProcessedInSql = true;
    }

    if (isAlreadyProcessedInSql) {
      logger.warn(`[Deposit Security] Deposit ID ${id} was already processed and credited in SQL transaction ID ${sqlTx.id}. Preventing double-crediting.`);
      // Ensure Firestore deposit status is updated if document exists
      if (depositDoc && depositDoc.exists) {
        try {
          await adminDb.collection('deposits').doc(id).update({
            processedByServer: true,
            status: 'success'
          });
        } catch (e) {}
      }
      return res.json({ success: true, message: 'Deposit was already processed and credited.' });
    }

    const isSuccessOrApproved = status === 'success' || status === 'approved';
    logger.info(`Processing deposit update for user ${userId}, status: ${status}, amount: ${finalAmountInBase}, isSuccessOrApproved: ${isSuccessOrApproved}`);

    let depositAmountWithBonus = new Big(finalAmountInBase || 0);
    if (isSuccessOrApproved && depositData?.promoCode && depositData?.promoBonus) {
        const bonusPercent = new Big(depositData.promoBonus);
        const bonusAmount = new Big(finalAmountInBase).times(bonusPercent).div(100);
        depositAmountWithBonus = depositAmountWithBonus.plus(bonusAmount);
        logger.info(`Applying promo bonus: ${depositData.promoCode} (${depositData.promoBonus}%) for user ${userId}. Bonus: ${bonusAmount.toFixed(2)}`);
    }

    // 1. Sync with SQL transactions table if applicable
    const tx = await get('SELECT * FROM transactions WHERE user_id = ? AND amount = ? AND type = \'deposit\' AND status = \'pending\' ORDER BY created_at DESC LIMIT 1', [userId, finalAmountInBase]) as any;
    
    if (tx) {
      const newStatus = isSuccessOrApproved ? 'completed' : status === 'rejected' ? 'rejected' : status;
      await run('UPDATE transactions SET status = ?, updated_at = datetime(\'now\') WHERE id = ?', [newStatus, tx.id]);
    } else if (isSuccessOrApproved) {
      // Robust fallback: insert the transaction into SQLite if it wasn't pre-synced
      const detailsObj = { firestoreId: id, walletNumber: depositData?.walletNumber || '', orderId: depositData?.orderId || '' };
      await run(
        `INSERT INTO transactions (user_id, type, amount, status, method, tx_hash, currency, details, created_at)
         VALUES (?, 'deposit', ?, 'completed', ?, ?, ?, ?, ?)`,
        [
          userId,
          finalAmountInBase.toString(),
          depositData?.method || 'direct',
          depositData?.trxId || '',
          depositData?.currency || 'BDT',
          JSON.stringify(detailsObj),
          Date.now()
        ]
      );
    }

    if (isSuccessOrApproved) {
        let user = await get('SELECT * FROM users WHERE uid = ?', [userId]) as any;
        if (!user) {
            // User not in SQL yet, sync from Firestore first
            const fbUser = await adminDb.collection('users').doc(userId).get();
            if (fbUser.exists) {
                const fbData = fbUser.data();
                await run(
                    `INSERT INTO users (uid, email, display_name, real_balance, demo_balance, country) 
                     VALUES (?, ?, ?, ?, ?, ?)`,
                    [userId, fbData.email || '', fbData.displayName || fbData.name || '', fbData.balance || 0, fbData.demoBalance || 10000, fbData.country || '']
                );
                user = await get('SELECT * FROM users WHERE uid = ?', [userId]) as any;
            }
        }

        if (user) {
            const currentBalance = new Big(user.real_balance || 0);
            const newBalance = currentBalance.plus(depositAmountWithBonus).toFixed(2);
            await run('UPDATE users SET real_balance = ? WHERE uid = ?', [newBalance, userId]);
            
            // Affiliate Commission (e.g., 10%) - based on original amount, not bonus
            const depositAmount = new Big(finalAmountInBase);
            if (user.referred_by_uid) {
                const commission = depositAmount.times(0.10).toFixed(2);
                await run(
                    'UPDATE users SET affiliate_balance = affiliate_balance + ?, total_affiliate_earnings = total_affiliate_earnings + ? WHERE uid = ?',
                    [commission, commission, user.referred_by_uid]
                );
                await createAuditLog(user.referred_by_uid, 'affiliate_commission', 'user', userId, { amount: finalAmountInBase, commission });
                
                // Write commission to Firestore collection for transaction list rendering
                if (adminDb) {
                    try {
                        await adminDb.collection('affiliate_commissions').add({
                            referrerUid: user.referred_by_uid,
                            referredUid: userId,
                            amount: parseFloat(commission),
                            depositAmount: parseFloat(finalAmountInBase),
                            currency: user.currency || 'USD',
                            percent: 10,
                            createdAt: Date.now(),
                            type: 'deposit_commission'
                        });
                    } catch (fsErr: any) {
                        logger.error(`Failed to write affiliate_commissions to Firestore: ${fsErr.message}`);
                    }
                }

                const updatedReferrer = await get('SELECT * FROM users WHERE uid = ?', [user.referred_by_uid]);
                if (updatedReferrer) {
                  const mappedReferrer = mapUserForFrontend(updatedReferrer);
                  getIO().to(`user_${user.referred_by_uid}`).emit('user_profile_update', mappedReferrer);
                  syncUserToFirestore(user.referred_by_uid, mappedReferrer);
                }
            }

            const updatedUser = await get('SELECT * FROM users WHERE uid = ?', [userId]);
            const mapped = mapUserForFrontend(updatedUser);
            if (mapped) {
                getIO().to(`user_${userId}`).emit('user_profile_update', mapped);
                syncUserToFirestore(userId, mapped);
            }
        }
        
        // Update Firebase balance regardless of SQL user existence (Legacy Fallback)
        try {
          const fbUserDoc = await adminDb.collection('users').doc(userId).get();
          if (fbUserDoc && fbUserDoc.exists) {
              const fbData = fbUserDoc.data();
              const currentFbBalance = fbData?.balance || 0;
              const currentFbDeposits = fbData?.totalDeposits || 0;
              await adminDb.collection('users').doc(userId).update({
                  balance: currentFbBalance + parseFloat(depositAmountWithBonus.toFixed(2)),
                  totalDeposits: currentFbDeposits + finalAmountInBase // keep totalDeposits as base amount for stats
              });
          }
        } catch (e: any) {
          logger.warn(`Could not update legacy Firebase user balance: ${e.message}`);
        }
    }
    // Also update the Firestore deposit request status
    try {
      await adminDb.collection('deposits').doc(id).update({ 
        status: isSuccessOrApproved ? 'success' : status,
        processedByServer: true
      });
    } catch (e: any) {
      logger.warn(`Could not update Firestore deposit status document: ${e.message}`);
    }
      
      // 2. Send Email Notification
      const user = await get('SELECT email, display_name FROM users WHERE uid = ?', [userId]) as any;
      if (user && user.email) {
        const isApproved = status === 'success' || status === 'approved';
        const isRejected = status === 'rejected';

        if (isApproved || isRejected) {
          const subject = isApproved ? 'Deposit Successful - Bivaax Trade' : 'Deposit Rejected - Bivaax Trade';
          const body = `
            <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-w: 600px; margin: 0 auto; background-color: #f4f7f9; padding: 20px;">
              <div style="background-color: ${isApproved ? '#10b981' : '#ef4444'}; padding: 40px; border-radius: 12px 12px 0 0; color: white; text-align: center;">
                <h1 style="margin: 0; font-size: 24px;">Deposit ${isApproved ? 'Approved' : 'Rejected'}</h1>
                <p style="opacity: 0.9; margin-top: 10px;">Transaction Status Update</p>
              </div>
              <div style="padding: 40px; background-color: white; border-radius: 0 0 12px 12px; border: 1px solid #e1e8ed;">
                <p style="font-size: 16px; color: #333;">Hello ${user.display_name || 'Trader'},</p>
                <p style="font-size: 16px; color: #333; line-height: 1.6;">Your deposit request has been reviewed by our financial department.</p>
                
                <div style="background-color: ${isApproved ? '#ecfdf5' : '#fef2f2'}; border-left: 4px solid ${isApproved ? '#10b981' : '#ef4444'}; padding: 20px; border-radius: 8px; margin: 25px 0;">
                  <p style="margin: 0; font-size: 14px; color: ${isApproved ? '#065f46' : '#991b1b'};"><strong>Status:</strong> ${isApproved ? 'COMPLETED' : 'REJECTED'}</p>
                  <p style="margin: 5px 0 0; font-size: 14px; color: ${isApproved ? '#047857' : '#b91c1c'};">${isApproved ? 'The funds have been credited to your real account balance.' : 'The transaction was declined. Please verify your payment details and try again.'}</p>
                </div>

                ${isApproved ? '<div style="text-align: center; margin: 30px 0;"><a href="#" style="background-color: #FFE24C; color: #1a1b23; padding: 12px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 14px; text-transform: uppercase;">Start Trading</a></div>' : ''}

                <p style="font-size: 14px; color: #64748b; line-height: 1.6;">If you have any questions regarding this transaction, please contact our 24/7 support team via live chat or email.</p>
                
                <hr style="border: 0; border-top: 1px solid #edf2f7; margin: 30px 0;">
                <div style="text-align: center; font-size: 12px; color: #94a3b8;">
                  <p>&copy; 2026 Bivaax Trade Financial Services</p>
                  <p>Ensuring Secure and Professional Global Trading</p>
                </div>
              </div>
            </div>`;
          await sendEmail(user.email, subject, body);
        }
      }

    res.json({ success: true });
  } catch (err: any) {
    logger.error(`Error in /admin/deposits/update: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

router.post('/admin/withdrawals/update', requireAuth, async (req: AuthRequest, res) => {
  if (!req.user?.isAdmin) return res.status(403).json({ error: 'Admin only' });
  const { id, status, userId, amount } = req.body;

  try {
    if (!adminDb) {
      return res.status(500).json({ error: 'Firestore is not initialized.' });
    }

    // Check if the withdrawal transaction has already been processed
    const withdrawalDoc = await adminDb.collection('withdrawals').doc(id).get();
    if (!withdrawalDoc.exists) {
      return res.status(404).json({ error: 'Withdrawal request not found.' });
    }
    const withdrawalData = withdrawalDoc.data();
    if (withdrawalData?.status === 'success' || withdrawalData?.status === 'approved' || withdrawalData?.status === 'rejected' || withdrawalData?.status === 'completed') {
      return res.status(400).json({ error: 'This withdrawal has already been processed.' });
    }

    // SQLite double-spend / duplicate withdrawal processing safety check
    let isAlreadyProcessedInSql = false;
    let sqlTx = await get('SELECT * FROM transactions WHERE user_id = ? AND details LIKE ?', [userId, `%${id}%`]) as any;
    if (sqlTx && (sqlTx.status === 'completed' || sqlTx.status === 'success' || sqlTx.status === 'approved' || sqlTx.status === 'rejected')) {
      isAlreadyProcessedInSql = true;
    }

    if (isAlreadyProcessedInSql) {
      logger.warn(`[Withdrawal Security] Withdrawal ID ${id} was already processed in SQL transaction ID ${sqlTx.id}. Preventing duplicate actions.`);
      // Ensure Firestore withdrawal status is updated
      await adminDb.collection('withdrawals').doc(id).update({ status });
      return res.json({ success: true, message: 'Withdrawal was already processed.' });
    }

    const tx = await get('SELECT * FROM transactions WHERE user_id = ? AND amount = ? AND type = \'withdrawal\' AND status = \'pending\' ORDER BY created_at DESC LIMIT 1', [userId, amount]) as any;
    if (tx) {
      const newStatus = status === 'success' ? 'completed' : status === 'rejected' ? 'rejected' : status;
      await run('UPDATE transactions SET status = ?, updated_at = datetime(\'now\') WHERE id = ?', [newStatus, tx.id]);
    }
    
    if (status === 'rejected') {
        let user = await get('SELECT * FROM users WHERE uid = ?', [userId]) as any;
        if (!user) {
            const fbUser = await adminDb.collection('users').doc(userId).get();
            if (fbUser.exists) {
                const fbData = fbUser.data();
                await run(
                    `INSERT INTO users (uid, email, display_name, real_balance, demo_balance, country) 
                     VALUES (?, ?, ?, ?, ?, ?)`,
                    [userId, fbData.email || '', fbData.displayName || fbData.name || '', fbData.balance || 0, fbData.demoBalance || 10000, fbData.country || '']
                );
                user = await get('SELECT * FROM users WHERE uid = ?', [userId]) as any;
            }
        }

        if (user) {
            const currentBalance = new Big(user.real_balance || 0);
            const refundAmount = new Big(amount);
            const newBalance = currentBalance.plus(refundAmount).toFixed(2);
            await run('UPDATE users SET real_balance = ? WHERE uid = ?', [newBalance, userId]);
            
            const updatedUser = await get('SELECT * FROM users WHERE uid = ?', [userId]);
            const mapped = mapUserForFrontend(updatedUser);
            if (mapped) {
              getIO().to(`user_${userId}`).emit('user_profile_update', mapped);
              syncUserToFirestore(userId, mapped);
            }

            // Also update Firebase balance
            const fbUserDoc = await adminDb.collection('users').doc(userId).get();
            if (fbUserDoc.exists) {
                const fbData = fbUserDoc.data();
                const currentFbBalance = fbData?.balance || 0;
                await adminDb.collection('users').doc(userId).update({
                    balance: currentFbBalance + amount
                });
            }
        }
    }
    
    // Also update the Firestore withdrawal request status
    await adminDb.collection('withdrawals').doc(id).update({ status });
    
    res.json({ success: true });
  } catch (err: any) {
    logger.error(`Error in /admin/withdrawals/update: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

router.get('/admin/config/fmp-key', requireAuth, async (req: AuthRequest, res) => {
  if (!req.user?.isAdmin) return res.status(403).json({ error: 'Admin only' });
  try {
    const doc = await adminDb.collection('app_config').doc('settings').get();
    const data = doc.exists ? doc.data() : {};
    res.json({ fmpApiKey: data?.fmpApiKey || process.env.FMP_API_KEY || '' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/admin/config/fmp-key', requireAuth, async (req: AuthRequest, res) => {
  if (!req.user?.isAdmin) return res.status(403).json({ error: 'Admin only' });
  try {
    const { fmpApiKey } = req.body;
    await adminDb.collection('app_config').doc('settings').set({ fmpApiKey }, { merge: true });
    // Also update process.env for the current session
    process.env.FMP_API_KEY = fmpApiKey;
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/admin/users', requireAuth, async (req: AuthRequest, res) => {
  if (!req.user?.isAdmin) return res.status(403).json({ error: 'Admin only' });
  try {
    await syncAllUsersFromFirestore();
  } catch (err: any) {
    logger.error(`[admin/users] syncAllUsersFromFirestore error: ${err.message}`);
  }
  try {
    const rawUsers = await query('SELECT * FROM users ORDER BY id DESC');
    const mappedUsers = (rawUsers || []).map(mapUserForFrontend);

    // Merge any missing Firestore user docs if available
    if (adminDb) {
      try {
        const snap = await adminDb.collection('users').get();
        if (!snap.empty) {
          const userMap = new Map<string, any>();
          mappedUsers.forEach(u => userMap.set(u.uid || u.id, u));
          snap.docs.forEach(d => {
            const fbData = d.data();
            const id = d.id;
            if (!userMap.has(id)) {
              const mapped = mapUserForFrontend({ uid: id, id, ...fbData });
              userMap.set(id, mapped);
            }
          });
          return res.json(Array.from(userMap.values()));
        }
      } catch (fsErr: any) {
        logger.error(`[admin/users] Firestore merge error: ${fsErr.message}`);
      }
    }

    res.json(mappedUsers);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/admin/users/update-balance', requireAuth, async (req: AuthRequest, res) => {
  if (!req.user?.isAdmin) return res.status(403).json({ error: 'Admin only' });
  const { userId, field, value } = req.body;

  try {
    const sqlField = field === 'realBalance' || field === 'balance' ? 'real_balance' : 'demo_balance';
    await run(`UPDATE users SET ${sqlField} = ? WHERE uid = ?`, [value, userId]);
    
    const user = await get('SELECT * FROM users WHERE uid = ?', [userId]);
    const mapped = mapUserForFrontend(user);
    getIO().to(`user_${userId}`).emit('user_profile_update', mapped);
    syncUserToFirestore(userId, mapped);
    
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/admin/users/smart-mode', requireAuth, async (req: AuthRequest, res) => {
  if (!req.user?.isAdmin) return res.status(403).json({ error: 'Admin only' });
  const { uid, smartModeEnabled, smartModeStrategy } = req.body;
  if (!uid) return res.status(400).json({ error: 'Missing uid' });
  try {
    await run(
      'UPDATE users SET smart_mode_enabled = ?, smart_mode_strategy = ? WHERE uid = ?',
      [smartModeEnabled ? 1 : 0, smartModeStrategy || 'auto_25_percent', uid]
    );
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/admin/users/manipulation', requireAuth, async (req: AuthRequest, res) => {
  if (!req.user?.isAdmin) return res.status(403).json({ error: 'Admin only' });
  const { uid, mode } = req.body;
  if (!uid || !mode) return res.status(400).json({ error: 'Missing uid or mode' });
  
  try {
    setUserManipulation(uid.toString(), mode);
    // Update local SQL
    await run('UPDATE users SET manipulation_mode = ? WHERE uid = ?', [mode, uid]);
    
    // Update Firestore to sync
    const user = await get('SELECT * FROM users WHERE uid = ?', [uid]);
    if (user) {
      const mapped = mapUserForFrontend(user);
      syncUserToFirestore(uid, mapped);
    }
    
    res.json({ success: true, mode });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/admin/transactions', requireAuth, async (req: AuthRequest, res) => {
  if (!req.user?.isAdmin) return res.status(403).json({ error: 'Admin only' });
  await syncGlobalTransactionsFromFirestore();
  const txs = await query('SELECT t.*, u.email FROM transactions t JOIN users u ON t.user_id = u.uid ORDER BY t.created_at DESC');
  res.json(txs);
});

router.get('/admin/trades', requireAuth, async (req: AuthRequest, res) => {
  if (!req.user?.isAdmin) return res.status(403).json({ error: 'Admin only' });
  const trades = await query('SELECT t.*, u.email FROM trades t JOIN users u ON t.user_id = u.uid ORDER BY t.created_at DESC');
  res.json(trades);
});

router.post('/admin/transactions/approve', requireAuth, async (req: AuthRequest, res) => {
  if (!req.user?.isAdmin) return res.status(403).json({ error: 'Admin only' });
  const { id } = req.body;

  try {
    await transaction(async (conn) => {
      const tx = await get('SELECT * FROM transactions WHERE id = ?', [id], conn) as any;
      if (!tx || tx.status !== 'pending') throw new Error('Invalid transaction');

      if (tx.type === 'deposit') {
        const user = await get('SELECT * FROM users WHERE uid = ?', [tx.user_id], conn) as any;
        const currentBalance = new Big(user.real_balance || 0);
        const depositAmount = new Big(tx.amount);
        const newBalance = currentBalance.plus(depositAmount).toFixed(2);
        await run('UPDATE users SET real_balance = ? WHERE uid = ?', [newBalance, tx.user_id], conn);

        // Affiliate Commission (e.g., 10%)
        if (user.referred_by_uid) {
          const commission = depositAmount.times(0.10).toFixed(2);
          await run(
            'UPDATE users SET affiliate_balance = affiliate_balance + ?, total_affiliate_earnings = total_affiliate_earnings + ? WHERE uid = ?',
            [commission, commission, user.referred_by_uid],
            conn
          );
          await createAuditLog(user.referred_by_uid, 'affiliate_commission', 'user', tx.user_id, { amount: tx.amount, commission });
          
          // Write commission to Firestore collection for transaction list rendering
          if (adminDb) {
            try {
              await adminDb.collection('affiliate_commissions').add({
                referrerUid: user.referred_by_uid,
                referredUid: tx.user_id,
                amount: parseFloat(commission),
                depositAmount: parseFloat(tx.amount),
                currency: user.currency || 'USD',
                percent: 10,
                createdAt: Date.now(),
                type: 'deposit_commission'
              });
            } catch (fsErr: any) {
              logger.error(`Failed to write affiliate_commissions to Firestore: ${fsErr.message}`);
            }
          }

          const updatedReferrer = await get('SELECT * FROM users WHERE uid = ?', [user.referred_by_uid], conn);
          if (updatedReferrer) {
            const mappedReferrer = mapUserForFrontend(updatedReferrer);
            getIO().to(`user_${user.referred_by_uid}`).emit('user_profile_update', mappedReferrer);
            syncUserToFirestore(user.referred_by_uid, mappedReferrer);
          }
        }
      }

      await run('UPDATE transactions SET status = ?, updated_at = datetime(\'now\') WHERE id = ?', ['completed', id], conn);

      // Notify user of balance update
      const updatedUser = await get('SELECT * FROM users WHERE uid = ?', [tx.user_id], conn) as any;

      // Send Email Notification
      try {
        const isDeposit = tx.type === 'deposit';
        await sendEmail(
          tx.email || updatedUser.email,
          `${isDeposit ? 'Deposit' : 'Withdrawal'} Successful - Bivaax Trade`,
          `<div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-w: 600px; margin: 0 auto; background-color: #f4f7f9; padding: 20px;">
            <div style="background-color: #10b981; padding: 40px; border-radius: 12px 12px 0 0; color: white; text-align: center;">
              <h1 style="margin: 0; font-size: 24px;">${isDeposit ? 'Deposit' : 'Withdrawal'} Completed</h1>
              <p style="opacity: 0.9; margin-top: 10px;">Funds Transferred Successfully</p>
            </div>
            <div style="padding: 40px; background-color: white; border-radius: 0 0 12px 12px; border: 1px solid #e1e8ed;">
              <p style="font-size: 16px; color: #333;">Hello ${updatedUser.display_name || 'Trader'},</p>
              <p style="font-size: 16px; color: #333; line-height: 1.6;">Your ${tx.type} of <strong>${tx.amount}</strong> has been successfully processed and completed.</p>
              
              <div style="background-color: #ecfdf5; border-left: 4px solid #10b981; padding: 20px; border-radius: 8px; margin: 25px 0;">
                <p style="margin: 0; font-size: 14px; color: #065f46;"><strong>Amount:</strong> ${tx.amount}</p>
                <p style="margin: 5px 0 0; font-size: 14px; color: #047857;"><strong>Status:</strong> COMPLETED</p>
              </div>

              <p style="font-size: 14px; color: #64748b; line-height: 1.6;">${isDeposit ? 'The funds are now available in your trading balance.' : 'The funds have been sent to your external wallet/account.'}</p>
              
              <hr style="border: 0; border-top: 1px solid #edf2f7; margin: 30px 0;">
              <div style="text-align: center; font-size: 12px; color: #94a3b8;">
                <p>&copy; 2026 Bivaax Trade Financial Services</p>
                <p>Ensuring Secure Global Finance</p>
              </div>
            </div>
          </div>`
        );
      } catch (e) {}

      const mapped = mapUserForFrontend(updatedUser);
      getIO().to(`user_${tx.user_id}`).emit('user_profile_update', mapped);
      syncUserToFirestore(tx.user_id, mapped);
    });
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/admin/transactions/reject', requireAuth, async (req: AuthRequest, res) => {
  if (!req.user?.isAdmin) return res.status(403).json({ error: 'Admin only' });
  const { id, reason } = req.body;

  try {
    await transaction(async (conn) => {
      const tx = await get('SELECT t.*, u.email FROM transactions t JOIN users u ON t.user_id = u.uid WHERE t.id = ?', [id], conn) as any;
      if (!tx || tx.status !== 'pending') throw new Error('Invalid transaction');

      // If it was a withdrawal, we need to refund the balance
      if (tx.type === 'withdrawal') {
        const user = await get('SELECT real_balance FROM users WHERE uid = ?', [tx.user_id], conn) as any;
        const currentBalance = new Big(user.real_balance || 0);
        const refundAmount = new Big(tx.amount);
        const newBalance = currentBalance.plus(refundAmount).toFixed(2);
        await run('UPDATE users SET real_balance = ? WHERE uid = ?', [newBalance, tx.user_id], conn);
      }

      await run('UPDATE transactions SET status = ?, updated_at = datetime(\'now\'), rejection_reason = ? WHERE id = ?', ['rejected', reason || 'Documentation mismatch or invalid transaction', id], conn);

      // Fetch user for notification
      const updatedUser = await get('SELECT * FROM users WHERE uid = ?', [tx.user_id], conn) as any;

      // Send Email Notification
      try {
        await sendEmail(
          tx.email,
          `${tx.type === 'deposit' ? 'Deposit' : 'Withdrawal'} Rejected - Bivaax Trade`,
          `<div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-w: 600px; margin: 0 auto; background-color: #f4f7f9; padding: 20px;">
            <div style="background-color: #ef4444; padding: 40px; border-radius: 12px 12px 0 0; color: white; text-align: center;">
              <h1 style="margin: 0; font-size: 24px;">Transaction Rejected</h1>
              <p style="opacity: 0.9; margin-top: 10px;">Action Required</p>
            </div>
            <div style="padding: 40px; background-color: white; border-radius: 0 0 12px 12px; border: 1px solid #e1e8ed;">
              <p style="font-size: 16px; color: #333;">Hello ${updatedUser.display_name || 'Trader'},</p>
              <p style="font-size: 16px; color: #333; line-height: 1.6;">Your ${tx.type} request for <strong>${tx.amount}</strong> has been rejected by our financial department.</p>
              
              <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 20px; border-radius: 8px; margin: 25px 0;">
                <p style="margin: 0; font-size: 14px; color: #991b1b;"><strong>Status:</strong> REJECTED</p>
                <p style="margin: 5px 0 0; font-size: 14px; color: #b91c1c;"><strong>Reason:</strong> ${reason || 'Invalid transaction details or verification failed.'}</p>
              </div>

              <p style="font-size: 14px; color: #64748b; line-height: 1.6;">If you believe this is an error, please review your transaction details and resubmit or contact our 24/7 support team.</p>
              
              <hr style="border: 0; border-top: 1px solid #edf2f7; margin: 30px 0;">
              <div style="text-align: center; font-size: 12px; color: #94a3b8;">
                <p>&copy; 2026 Bivaax Trade Financial Services</p>
                <p>Secure Professional Trading Platform</p>
              </div>
            </div>
          </div>`
        );
      } catch (e) {}

      // Notify user via Socket
      const mapped = mapUserForFrontend(updatedUser);
      getIO().to(`user_${tx.user_id}`).emit('user_profile_update', mapped);
      syncUserToFirestore(tx.user_id, mapped);
    });
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Aliases for compatibility
router.get('/users', requireAuth, async (req: AuthRequest, res) => {
  const referredByUid = req.query.referredByUid as string;
  const affiliateId = req.query.affiliateId as string;
  const referralCode = req.query.referralCode as string;
  const uid = req.query.uid as string;

  if (referredByUid) {
    const referredUsers = await query('SELECT * FROM users WHERE referred_by_uid = ?', [referredByUid]);
    return res.json(referredUsers.map(mapUserForFrontend));
  }

  if (affiliateId) {
    const matched = await get('SELECT * FROM users WHERE referral_code = ?', [affiliateId]);
    return res.json(matched ? [mapUserForFrontend(matched)] : []);
  }

  if (referralCode) {
    const matched = await get('SELECT * FROM users WHERE referral_code = ?', [referralCode]);
    return res.json(matched ? [mapUserForFrontend(matched)] : []);
  }

  if (uid) {
    const matched = await get('SELECT * FROM users WHERE uid = ?', [uid]);
    return res.json(matched ? [mapUserForFrontend(matched)] : []);
  }

  const user = await get('SELECT * FROM users WHERE uid = ?', [req.user!.uid]);
  res.json([mapUserForFrontend(user)]);
});

router.get('/trades', requireAuth, async (req: AuthRequest, res) => {
  const trades = await query('SELECT * FROM trades WHERE user_id = ? ORDER BY created_at DESC', [req.user!.uid]);
  res.json(trades);
});

router.get('/transactions', requireAuth, async (req: AuthRequest, res) => {
  const txs = await query('SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC', [req.user!.uid]);
  res.json(txs);
});

// --- Settings & Config ---
const defaultSettings = {
  maintenanceMode: false,
  minDeposit: 10,
  minWithdraw: 15,
  payoutRates: { default: 82, crypto: 85, stocks: 75 },
  binancePayQrCode: "https://i.postimg.cc/Gt5SP1L4/IMG-20260804-141135.png",
  binancePayEnabled: true,
  usdtTrc20Address: "TD73cKwhFQ3i5e43TYyoyMPijvkU4uHVwi",
  usdtTrc20QrCode: "https://i.postimg.cc/ZKN9zFGL/IMG-20260804-151047.png",
  usdtTrc20Enabled: true,
  ethAddress: "0x8e01631855cf57fa2da27ff30c181cca137aefb5",
  ethQrCode: "https://i.postimg.cc/T3WzTQGD/IMG-20260804-151727.png",
  ethEnabled: true,
  btcAddress: "0x8e01631855cf57fa2da27ff30c181cca137aefb5",
  btcQrCode: "https://i.postimg.cc/GpKwd7Gr/IMG-20260804-235328.png",
  btcEnabled: true,
  tonAddress: "UQCCpPsMUQJZK9DEzR-C51gJ13vBtSfPKNm53h1Wxys3Bof5",
  tonQrCode: "https://i.postimg.cc/TYcfV9hD/IMG-20260805-120710.png",
  tonEnabled: true,
  dogeAddress: "DQxycdGAx3Je27YSAc87WJ7ANq9McALh4U",
  dogeQrCode: "https://i.postimg.cc/cCgtKzdX/IMG-20260805-121203.png",
  dogeEnabled: true,
  ltcAddress: "LQ41bM2B892pfDX1suYe15hmsDuozgyZfU",
  ltcQrCode: "https://i.postimg.cc/9FCX4MCs/IMG-20260805-125156.png",
  ltcEnabled: true,
};

router.get('/app_config/settings', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : req.cookies?.token;
    let isAdmin = false;
    
    if (token) {
      try {
        const { verifyToken } = await import('../lib/auth-server.ts');
        let decoded = verifyToken(token);
        if (!decoded) {
          const jwt = await import('jsonwebtoken');
          const payload = jwt.default.decode(token) as any;
          if (payload) {
            decoded = {
              uid: payload.uid || payload.sub || payload.user_id,
              email: payload.email,
              isAdmin: !!payload.isAdmin || !!payload.admin
            } as any;
          }
        }
        if (decoded) {
          const dbUser = await get('SELECT is_admin, email FROM users WHERE uid = ? OR email = ?', [decoded.uid, decoded.email]) as any;
          const userEmail = (dbUser?.email || decoded.email)?.toLowerCase().trim();
          const hardcodedAdminEmails = [
            'bivaaxtrader@gmail.com',
            'hamproosapport@gmail.com',
            'hamproosupport@gmail.com',
            (process.env.VITE_ADMIN_EMAIL || '').toLowerCase().trim()
          ].filter(Boolean);

          if ((dbUser && dbUser.is_admin) || (userEmail && hardcodedAdminEmails.includes(userEmail))) {
            isAdmin = true;
          }
        }
      } catch (e) {
        // ignore auth errors
      }
    }

    const docSnap = await adminDb.collection('app_config').doc('settings').get();
    const data = docSnap.exists ? docSnap.data() : {};
    
    const responseData = {
      ...defaultSettings,
      ...data
    };

    if (!isAdmin) {
      // Strip sensitive SMTP credentials and keys for safety
      delete responseData.smtpHost;
      delete responseData.smtpPort;
      delete responseData.smtpUser;
      delete responseData.smtpPass;
      delete responseData.smtpFromEmail;
      delete responseData.smtpFromName;
      delete responseData.fmpApiKey;
      delete responseData.geminiApiKey;
    }

    res.json(responseData);
  } catch (err: any) {
    logger.error('Error fetching settings:', err);
    res.status(500).json({ error: err.message });
  }
});

router.patch('/app_config/settings', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!req.user?.isAdmin) {
      return res.status(403).json({ error: 'Forbidden: Admin access required' });
    }

    await adminDb.collection('app_config').doc('settings').set(req.body, { merge: true });
    res.json({ success: true });
  } catch (err: any) {
    logger.error('Error saving app_config settings:', err);
    res.status(500).json({ error: err.message });
  }
});

// --- News & Newsletter ---
router.post('/newsletter', async (req, res) => {
  res.json({ success: true });
});

// --- KYC Identity Verification Routes ---

// 1. Scan and verify KYC document via Gemini AI
router.post('/kyc/scan', requireAuth, async (req: AuthRequest, res) => {
  const { image } = req.body;
  if (!image) {
    return res.status(400).json({ error: 'Image data is required' });
  }

  try {
    const ai = getGeminiClient();
    
    // Clean base64 string
    let base64Data = image;
    let mimeType = 'image/jpeg';
    if (image.includes(';base64,')) {
      const parts = image.split(';base64,');
      const mimePart = parts[0];
      base64Data = parts[1];
      mimeType = mimePart.replace('data:', '');
    }

    const systemInstruction = `You are an expert official KYC compliance officer. 
Analyze the uploaded National ID (NID), Passport, or Driving License image.
Verify if:
1. It is a genuine, official document (NID, Passport, or License) from a country (frequently Bangladesh, but can be other countries).
2. It is an original physical card/document itself, NOT a photograph of a computer screen, a photocopy, a piece of paper, a random object, or a fake generated card.
3. The details are legible.

Extract these details:
- Document Type: NID, Passport, or License.
- Document Number (the official card or ID number).
- Full Name.
- Date of Birth (standard YYYY-MM-DD format).
- Calculate Age as of 2026-07-18 and determine if the person is over 18 (isOver18: true).
- Address (if present).
- Originality confidence: a score from 0-100 on how confident you are that this is a real, original, physical card/document in hand.
- isOriginal: true if confidence >= 80, else false.
- Rejection reason: if not valid, not readable, or appears fake/copied, state the clear reason in a friendly but professional tone.

Provide your response strictly matching the schema. If it's not a real ID card, set isValidDocument to false and provide a rejectionReason.`;

    const imagePart = {
      inlineData: {
        mimeType: mimeType,
        data: base64Data,
      },
    };

    const promptPart = {
      text: "Analyze this document image for official KYC verification. Be extremely precise and strict. Rejects fakes, computer screens, or paper prints.",
    };

    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: { parts: [imagePart, promptPart] },
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            isValidDocument: { type: Type.BOOLEAN },
            documentType: { type: Type.STRING },
            documentNumber: { type: Type.STRING },
            fullName: { type: Type.STRING },
            dateOfBirth: { type: Type.STRING },
            age: { type: Type.INTEGER },
            isOver18: { type: Type.BOOLEAN },
            address: { type: Type.STRING },
            originalityConfidence: { type: Type.INTEGER },
            isOriginal: { type: Type.BOOLEAN },
            rejectionReason: { type: Type.STRING }
          },
          required: ["isValidDocument", "documentType", "documentNumber", "fullName", "dateOfBirth", "age", "isOver18", "isOriginal"]
        }
      }
    });

    const text = response.text;
    if (!text) {
      throw new Error("Empty response from AI engine");
    }

    const result = JSON.parse(text.trim());
    res.json(result);
  } catch (err: any) {
    logger.error(`KYC scan failed: ${err.message}`);
    res.status(500).json({ error: err.message || 'Verification scan failed' });
  }
});

// 1b. AI Verification (Automatic validation & approval/rejection)
router.post('/kyc/verify-ai', requireAuth, async (req: AuthRequest, res) => {
  const { idType, idFrontUrl, idBackUrl } = req.body;
  const userId = req.user!.uid;

  if (!idFrontUrl) {
    return res.status(400).json({ error: 'Front image is required' });
  }

  try {
    let ai;
    try {
      ai = getGeminiClient();
    } catch (keyErr: any) {
      if (keyErr.message.includes('GEMINI_API_KEY')) {
        return res.status(400).json({
          error: "Sorry, the AI verification system is currently unavailable. Please add your 'GEMINI_API_KEY' in the Google AI Studio Settings > Secrets panel to enable this feature."
        });
      }
      throw keyErr;
    }

    // Helper to process base64
    const processImageBase64 = (base64Str: string) => {
      let base64Data = base64Str;
      let mimeType = 'image/jpeg';
      if (base64Str.includes(';base64,')) {
        const parts = base64Str.split(';base64,');
        const mimePart = parts[0];
        base64Data = parts[1];
        mimeType = mimePart.replace('data:', '');
      }
      return { inlineData: { mimeType, data: base64Data } };
    };

    const contents: any[] = [];
    contents.push(processImageBase64(idFrontUrl));

    if (idBackUrl) {
      contents.push(processImageBase64(idBackUrl));
    }

    const systemInstruction = `You are an expert official KYC compliance officer with advanced document fraud detection capabilities.
Analyze the uploaded image(s). The user claims this is an official ${idType} document (which must be a National ID card, Passport, or Driving License).

You MUST perform a strict verification:
1. Verify if the document is genuinely an official ${idType} (National ID, Passport, or Driving License) from any country (frequently Bangladesh, but can be other countries).
2. If it is NOT an official ${idType} (for example, if the user uploaded a photo of a dog, a selfie, a laptop screen, a piece of blank paper, a photocopy, a bank statement, or a utility bill), you MUST set "isValidDocument" to false and provide a clear, professional, direct Bengali rejection reason in "rejectionReason".
3. Check if the document appears to be a physical original card/document, not a photo of a computer monitor, a printed paper, or a fake.
4. Extract the Full Name and Document ID Number.

Respond strictly in JSON matching the schema:
{
  "isValidDocument": boolean (true if valid and authentic NID/Passport/Driving License, false otherwise),
  "fullName": string (full name extracted from document, or empty if invalid),
  "documentNumber": string (ID or Passport number extracted from document, or empty if invalid),
  "rejectionReason": string (if isValidDocument is false, provide a professional, helpful rejection reason in Bengali explaining exactly why it was rejected. Example: "দুঃখিত, আপনার আপলোড করা ছবিটি একটি বৈধ NID কার্ড বলে মনে হচ্ছে না। অনুগ্রহ করে আপনার আসল ফিজিক্যাল NID কার্ডের পরিষ্কার ছবি আপলোড করুন।")
}`;

    contents.push({
      text: `Verify this document as an official physical ${idType}. Please perform OCR and check for document authenticity.`
    });

    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: { parts: contents },
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            isValidDocument: { type: Type.BOOLEAN },
            fullName: { type: Type.STRING },
            documentNumber: { type: Type.STRING },
            rejectionReason: { type: Type.STRING }
          },
          required: ["isValidDocument", "fullName", "documentNumber"]
        }
      }
    });

    const text = response.text;
    if (!text) {
      throw new Error("Empty response from AI engine");
    }

    const result = JSON.parse(text.trim());
    const isApproved = result.isValidDocument;
    const status = isApproved ? 'approved' : 'rejected';
    const kyc_status = isApproved ? 'verified' : 'unverified';

    // 1. Save to Firestore (if active)
    let firestoreId = '';
    try {
      const docRef = await adminDb.collection('kycRequests').add({
        userId,
        userEmail: req.user!.email,
        fullName: result.fullName || '---',
        idType: idType,
        idNumber: result.documentNumber || '---',
        idFrontUrl: idFrontUrl,
        idBackUrl: idBackUrl || '',
        selfieUrl: '',
        status: status,
        rejectionReason: result.rejectionReason || '',
        submittedAt: Date.now(),
        createdAt: new Date(),
        updatedAt: new Date()
      });
      firestoreId = docRef.id;
    } catch (firestoreErr: any) {
      logger.warn(`Firestore KYC AI submission failed: ${firestoreErr.message}`);
    }

    // 2. Save to SQL Database
    await run(
      `INSERT INTO kyc_requests (user_id, status, full_name, document_type, document_number, front_image, back_image, selfie_image, rejection_reason, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId, 
        status, 
        result.fullName || '---', 
        idType, 
        result.documentNumber || '---', 
        idFrontUrl, 
        idBackUrl || '', 
        '', 
        result.rejectionReason || '',
        Date.now(), 
        Date.now()
      ]
    );

    // 3. Update users table
    await run('UPDATE users SET kyc_status = ? WHERE uid = ?', [kyc_status, userId]);

    // 4. Send Instant Email
    try {
      const userDoc = await get('SELECT email, display_name FROM users WHERE uid = ?', [userId]) as any;
      if (userDoc) {
        const mailSubject = isApproved ? 'Identity Verification Approved' : 'Identity Verification Rejected';
        const mailBody = `<div style="font-family: sans-serif; max-w: 600px; margin: 0 auto; background-color: #f9f9f9; padding: 20px;">
          <div style="background-color: ${isApproved ? '#4CAF50' : '#ef4444'}; padding: 30px; border-radius: 10px; color: white; text-align: center;">
            <h2 style="margin: 0; font-size: 24px;">Identity Verification (KYC) ${isApproved ? 'Approved' : 'Rejected'}</h2>
          </div>
          <div style="padding: 30px; background-color: white; border-radius: 0 0 10px 10px; border: 1px solid #eee; text-align: left; color: #333; line-height: 1.6;">
            <p>Hello ${userDoc.display_name || 'Trader'},</p>
            <p>Your identity verification (KYC) request has been processed automatically by our AI compliance system.</p>
            ${isApproved 
              ? `<div style="background-color: #f0fdf4; border-left: 4px solid #16a34a; padding: 15px; border-radius: 4px; margin: 20px 0;">
                  <strong style="color: #15803d; font-size: 16px;">Congratulations! Your KYC is verified.</strong>
                  <p style="margin: 5px 0 0; font-size: 14px; color: #166534;">Your account is now fully active. All trading, deposit, and withdrawal limitations have been cleared.</p>
                 </div>` 
              : `<div style="background-color: #fef2f2; border-left: 4px solid #dc2626; padding: 15px; border-radius: 4px; margin: 20px 0;">
                  <strong style="color: #b91c1c; font-size: 16px;">Verification Failed:</strong>
                  <p style="margin: 5px 0 0; font-size: 14px; color: #991b1b;">${result.rejectionReason || 'The uploaded document is invalid or not clearly readable.'}</p>
                 </div>
                 <p>Please review our compliance checklist and try uploading a high-quality photo of your original, physical document.</p>`}
            <hr style="border: 0; border-top: 1px solid #eee; margin: 25px 0;">
            <p style="font-size: 11px; color: #999; text-align: center; text-transform: uppercase; letter-spacing: 1px;">Bivaax Trade Security & Compliance Team</p>
          </div>
        </div>`;

        await sendEmail(userDoc.email, mailSubject, mailBody);
      }
    } catch (e: any) {
      logger.error(`Failed to send KYC result email: ${e.message}`);
    }

    // 5. Emit socket event
    const updatedUser = await get('SELECT * FROM users WHERE uid = ?', [userId]) as any;
    if (updatedUser) {
      const mapped = mapUserForFrontend(updatedUser);
      getIO().to(`user_${userId}`).emit('user_profile_update', mapped);
      syncUserToFirestore(userId, mapped);
    }

    res.json({
      success: isApproved,
      isValidDocument: isApproved,
      fullName: result.fullName,
      documentNumber: result.documentNumber,
      rejectionReason: result.rejectionReason || ''
    });

  } catch (err: any) {
    logger.error(`KYC AI verify failed: ${err.message}`);
    res.status(500).json({ error: err.message || 'Verification failed. Please try again.' });
  }
});

// 2. Submit KYC verification application (linked with Firestore)
router.post('/kyc', requireAuth, async (req: AuthRequest, res) => {
  const { userId, kycData } = req.body;
  if (!userId || !kycData) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  try {
    // Write request to Firestore (if available)
    let firestoreId = '';
    try {
      const docRef = await adminDb.collection('kycRequests').add({
        userId,
        userEmail: kycData.userEmail || req.user!.email,
        fullName: kycData.fullName,
        idType: kycData.idType,
        idNumber: kycData.idNumber,
        idFrontUrl: kycData.idFrontUrl,
        idBackUrl: kycData.idBackUrl || '',
        selfieUrl: kycData.selfieUrl || '',
        status: 'pending',
        submittedAt: Date.now(),
        createdAt: new Date(),
        updatedAt: new Date()
      });
      firestoreId = docRef.id;
    } catch (firestoreErr: any) {
      logger.warn(`Firestore KYC submission failed: ${firestoreErr.message}`);
    }

    // Write to SQL database (Backup/Primary fallback)
    await run(
      `INSERT INTO kyc_requests (user_id, status, full_name, document_type, document_number, front_image, back_image, selfie_image, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId, 
        'pending', 
        kycData.fullName, 
        kycData.idType, 
        kycData.idNumber, 
        kycData.idFrontUrl, 
        kycData.idBackUrl || '', 
        kycData.selfieUrl || '', 
        Date.now(), 
        Date.now()
      ]
    );

    // Update users table in SQLite/MySQL database
    const sqlRes = await run('UPDATE users SET kyc_status = ? WHERE uid = ?', ['pending', userId]);
    logger.info(`KYC status updated in SQL for ${userId}: ${JSON.stringify(sqlRes)}`);

    // Emit live socket event to notify user profile has changed
    const updatedUser = await get('SELECT * FROM users WHERE uid = ?', [userId]) as any;
    if (updatedUser) {
      const mapped = mapUserForFrontend(updatedUser);
      getIO().to(`user_${userId}`).emit('user_profile_update', mapped);
      syncUserToFirestore(userId, mapped);
    }

    res.json({ success: true, id: firestoreId || `sql-${Date.now()}` });
  } catch (err: any) {
    logger.error(`Error submitting KYC request: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// 3. Get latest KYC status of user
router.get('/user/kyc-status', async (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: 'userId is required' });
  try {
    let snap;
    try {
      snap = await adminDb.collection('kycRequests')
        .where('userId', '==', userId)
        .orderBy('submittedAt', 'desc')
        .limit(1)
        .get();
    } catch (firestoreErr: any) {
      if (firestoreErr.code !== 5 && !firestoreErr.message?.includes('NOT_FOUND')) {
        logger.warn(`Firestore KYC fetch failed: ${firestoreErr.message}`);
      }
      // Fallback to SQL below
      snap = { empty: true };
    }
    
    if (snap && !snap.empty) {
      const docData = snap.docs[0].data();
      res.json({
        id: snap.docs[0].id,
        status: docData.status || 'pending', // Fallback for improperly formatted legacy documents
        createdAt: docData.submittedAt || Date.now(),
        ...docData
      });
    } else {
      const user = await get('SELECT kyc_status FROM users WHERE uid = ?', [userId]) as any;
      if (user) {
        res.json({ status: user.kyc_status === 'verified' ? 'approved' : user.kyc_status });
      } else {
        res.json(null);
      }
    }
  } catch (err: any) {
    logger.error(`Error fetching kyc status: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// 4. Update KYC request status (Admin-only operation)
router.post('/admin/kyc/update', requireAuth, async (req: AuthRequest, res) => {
  if (!req.user?.isAdmin) {
    return res.status(403).json({ error: 'Unauthorized admin operations' });
  }

  const { id, userId, status, rejectionReason } = req.body;
  if (!id || !userId || !status) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  try {
    // 1. Update Firestore
    await adminDb.collection('kycRequests').doc(id).update({
      status,
      rejectionReason: rejectionReason || '',
      updatedAt: new Date()
    });

    // 2. Update users table (kyc_status)
    const kyc_status = status === 'approved' ? 'verified' : 'unverified';
    await run('UPDATE users SET kyc_status = ? WHERE uid = ?', [kyc_status, userId]);

    // 3. Update SQL kyc_requests table
    await run(
      'UPDATE kyc_requests SET status = ?, rejection_reason = ?, updated_at = ? WHERE user_id = ? AND status = \'pending\'',
      [status, rejectionReason || '', Date.now(), userId]
    );

    // 4. Emit live socket event and sync to Firestore
    const updatedUser = await get('SELECT * FROM users WHERE uid = ?', [userId]) as any;
    if (updatedUser) {
      const mapped = mapUserForFrontend(updatedUser);
      getIO().to(`user_${userId}`).emit('user_profile_update', mapped);
      syncUserToFirestore(userId, mapped);
    }

    // 5. Send KYC Result Email
    try {
      const userDoc = await get('SELECT email, display_name FROM users WHERE uid = ?', [userId]) as any;
      if (userDoc) {
        const isApproved = status === 'approved';
        await sendEmail(
          userDoc.email,
          `Identity Verification ${isApproved ? 'Approved' : 'Rejected'}`,
          `<div style="font-family: sans-serif; max-w: 600px; margin: 0 auto; background-color: #f9f9f9; padding: 20px;">
            <div style="background-color: ${isApproved ? '#4CAF50' : '#ef4444'}; padding: 30px; border-radius: 10px; color: white; text-align: center;">
              <h2 style="margin: 0;">KYC ${isApproved ? 'Approved' : 'Rejected'}</h2>
            </div>
            <div style="padding: 30px; background-color: white; border-radius: 0 0 10px 10px; border: 1px solid #eee;">
              <p>Hello ${userDoc.display_name || 'Trader'},</p>
              <p>Your identity verification (KYC) request has been reviewed by our compliance team.</p>
              ${isApproved 
                ? `<div style="background-color: #f0fdf4; border-left: 4px solid #16a34a; padding: 15px; border-radius: 4px; margin: 20px 0;">
                    <strong style="color: #15803d;">Status: VERIFIED</strong>
                    <p style="margin: 5px 0 0; font-size: 14px; color: #166534;">Your account limits have been removed.</p>
                   </div>` 
                : `<div style="background-color: #fef2f2; border-left: 4px solid #dc2626; padding: 15px; border-radius: 4px; margin: 20px 0;">
                    <strong style="color: #b91c1c;">Status: REJECTED</strong>
                    <p style="margin: 5px 0 0; font-size: 14px; color: #991b1b;">Reason: ${rejectionReason || 'Document mismatch or low quality.'}</p>
                   </div>
                   <p>Please re-submit with correct documents in the Profile section.</p>`}
              <hr style="border: 0; border-top: 1px solid #eee; margin: 25px 0;">
              <p style="font-size: 11px; color: #999; text-align: center;">BIVAXX COMPLIANCE TEAM</p>
            </div>
          </div>`
        );
      }
    } catch (e: any) {
      logger.error(`Failed to send KYC admin update email: ${e.message}`);
    }

    res.json({ success: true });
  } catch (err: any) {
    logger.error(`Error updating KYC request status: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// --- Activities & Banners ---
router.get('/activities', async (req, res) => {
  res.json([
    { id: '1', title: 'Welcome Bonus', description: 'Get 100% bonus on your first deposit!', image: 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?auto=format&fit=crop&q=80&w=1000' },
    { id: '2', title: 'Refer & Earn', description: 'Invite your friends and earn 10% commission.', image: 'https://images.unsplash.com/photo-1553729459-efe14ef6055d?auto=format&fit=crop&q=80&w=1000' }
  ]);
});

router.post('/activities', async (req, res) => {
  res.json({ success: true });
});

// --- Legacy/Alias Routes for Compatibility ---
router.post('/deposit', async (req, res) => {
  // Redirect to wallet/deposit logic or just re-implement
  res.status(200).json({ success: true, message: 'Deposit endpoint reached. Please use /api/wallet/deposit' });
});

router.post('/withdraw', async (req, res) => {
  res.status(200).json({ success: true, message: 'Withdraw endpoint reached. Please use /api/wallet/withdraw' });
});

router.get('/transactions', requireAuth, async (req: AuthRequest, res) => {
  const history = await query(
    `SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`,
    [req.user!.uid]
  );
  res.json(history);
});

router.post('/trade/prune-demo', async (req, res) => {
  res.json({ success: true });
});

router.post('/security/log-access', async (req, res) => {
  res.json({ success: true });
});

router.post('/alerts', async (req, res) => {
  res.json({ success: true });
});

// Generic Firestore Proxy Routes (for collections not explicitly handled)
// These are placed at the end to act as a fallback for the custom frontend firebase.ts

// 3-segment routes first
router.get('/:collection/:id/:subcollection', async (req, res) => {
  const { collection, id, subcollection } = req.params;
  try {
    const snapshot = await adminDb.collection(collection).doc(id).collection(subcollection).get();
    const docs: any[] = [];
    snapshot.forEach((doc: any) => docs.push({ id: doc.id, ...doc.data() }));
    res.json(docs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:collection/:id/:subcollection', async (req, res) => {
  const { collection, id, subcollection } = req.params;
  try {
    const docRef = await adminDb.collection(collection).doc(id).collection(subcollection).add(req.body);
    res.json({ id: docRef.id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 2-segment routes
router.get('/:collection/:id', async (req, res) => {
  const { collection, id } = req.params;
  try {
    const doc = await adminDb.collection(collection).doc(id).get();
    if (!doc.exists) return res.status(404).json({ error: 'Not found' });
    res.json({ id: doc.id, ...doc.data() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:collection/:id', async (req, res) => {
  const { collection, id } = req.params;
  try {
    await adminDb.collection(collection).doc(id).update(req.body);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:collection/:id', async (req, res) => {
  const { collection, id } = req.params;
  try {
    await adminDb.collection(collection).doc(id).delete();
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 1-segment routes last
router.get('/:collection', async (req, res) => {
  const { collection } = req.params;
  try {
    const snapshot = await adminDb.collection(collection).get();
    const docs: any[] = [];
    snapshot.forEach((doc: any) => docs.push({ id: doc.id, ...doc.data() }));
    res.json(docs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:collection', async (req, res) => {
  const { collection } = req.params;
  try {
    const docRef = await adminDb.collection(collection).add(req.body);
    logger.info(`Successfully added document to Firestore collection ${collection}: ${docRef.id}`);
    res.json({ id: docRef.id });
  } catch (err: any) {
    logger.error(`Error adding to Firestore collection ${collection}: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

export async function seedDefaultPages() {
  if (!adminDb) return;
  const pages = [
    { id: 'about_us', title: 'About Us', content: '<h1>About Us</h1><p>Welcome to Bivaax Trade.</p>' },
    { id: 'client_agreement', title: 'Client Agreement', content: '<h1>Client Agreement</h1><p>Terms and conditions...</p>' },
    { id: 'regulations', title: 'Regulations', content: '<h1>Regulations</h1><p>Our regulatory compliance...</p>' }
  ];

  try {
    for (const page of pages) {
      const pageRef = adminDb.collection('pages').doc(page.id);
      const doc = await pageRef.get();
      if (!doc.exists) {
        await pageRef.set({
          ...page,
          updatedAt: Date.now(),
          createdAt: Date.now()
        });
        logger.info(`✅ Seeded page: ${page.id}`);
      }
    }
  } catch (err) {
    logger.error('Error seeding pages:', err);
  }
}

export default router;
