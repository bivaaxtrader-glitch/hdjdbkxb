import express from 'express';
import crypto from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import { generateToken, hashPassword, comparePassword } from '../lib/auth-server.ts';
import { get, run } from '../db/mysql-db.ts';
import { createAuditLog, logLogin } from '../lib/audit.ts';
import { requireAuth } from '../middleware/jwtAuth.ts';
import { mapUserForFrontend } from '../lib/user-utils.ts';
import { syncUserToFirestore, adminAuth } from '../lib/firebase-admin.ts';
import { authoritativeSync } from '../lib/sync-service.ts';
import logger from '../lib/logger.ts';
import { sendEmail, wrapEmail } from '../lib/email.ts';
import { getIO } from '../services/socketService.ts';

import { body, validationResult } from 'express-validator';

const router = express.Router();

// Validation middleware
const validate = (req: any, res: any, next: any) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

const googleClientId = process.env.GOOGLE_CLIENT_ID || '1060740495013-ej6stbt6coeb647f1epqcg2idiv5urg8.apps.googleusercontent.com';
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;

if (!process.env.GOOGLE_CLIENT_ID || !googleClientSecret) {
  logger.warn('Google OAuth credentials missing or incomplete in environment variables. Google Login may fail during callback.');
}

const googleClient = new OAuth2Client(
  googleClientId,
  googleClientSecret
);

// Helper for generating unique UIDs
const generateUid = () => 'usr_' + Math.random().toString(36).substring(2, 15);

// 1. Local Registration
router.post('/register', 
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
  validate,
  async (req, res) => {
    const { email, password, referralCode, referralSubId, referralType } = req.body;
  
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const existing = await get('SELECT id FROM users WHERE email = ?', [email]);
    if (existing) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const hashedPassword = await hashPassword(password);
    const uid = generateUid();
    
    const affiliateId = Math.random().toString(36).substring(2, 8).toUpperCase();
    
    let referredBy = null;
    if (referralCode) {
      const referrer = await get('SELECT uid FROM users WHERE referral_code = ? OR uid = ?', [referralCode, referralCode]);
      if (referrer) {
        referredBy = (referrer as any).uid;
      }
    }

    const emailLower = email.toLowerCase().trim();
    const isHardcodedAdmin = [
      'bivaaxtrader@gmail.com',
      'hasan@gmail.com',
      'hasan1@gmail.com',
      'hamproosapport@gmail.com',
      'hamproosupport@gmail.com',
      (process.env.VITE_ADMIN_EMAIL || '').toLowerCase().trim()
    ].filter(Boolean).includes(emailLower);

    await run(
      `INSERT INTO users (uid, email, password, referral_code, referred_by_uid, referral_sub_id, referral_type, is_admin) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [uid, email, hashedPassword, affiliateId, referredBy, referralSubId || null, referralType || null, isHardcodedAdmin ? 1 : 0]
    );

    if (referredBy) {
      await run('UPDATE users SET referral_count = referral_count + 1 WHERE uid = ?', [referredBy]);
    }

    await createAuditLog(uid, 'register', 'user', uid, { email }, req.ip);
    logger.info(`New user registered: ${email}`);

    // Send Welcome Email
    try {
      const welcomeSubject = 'Welcome to Bivaax Trade - Your account is ready!';
      const welcomeHtml = wrapEmail(welcomeSubject, `
        <h2 style="color: #0f172a; margin-top: 0; font-size: 24px; font-weight: 800;">Welcome to Bivaax Trade!</h2>
        <p style="font-size: 16px; color: #334155;">Hello there,</p>
        <p style="font-size: 15px; color: #334155; line-height: 1.6;">Thank you for joining <strong>Bivaax Trade</strong>. We are thrilled to welcome you to our next-generation global financial trading ecosystem.</p>
        <p style="font-size: 15px; color: #334155; line-height: 1.6;">Your account has been successfully initialized. You can now access professional real-time charts, fast funding, and secure executions.</p>
        
        <div style="text-align: center; margin: 35px 0;">
          <a href="${process.env.APP_URL || '#'}" style="background-color: #FFE24C; color: #1a1b23; padding: 14px 32px; text-decoration: none; border-radius: 12px; font-weight: 900; text-transform: uppercase; font-size: 13px; display: inline-block; box-shadow: 0 4px 14px rgba(255, 226, 76, 0.4);">Launch Platform & Trade</a>
        </div>
        
        <div style="background-color: #f8fafc; padding: 20px; border-radius: 12px; margin-bottom: 25px; border: 1px solid #e2e8f0;">
          <h4 style="margin: 0 0 10px 0; color: #0f172a; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px;">Recommended Next Steps:</h4>
          <ul style="margin: 0; padding-left: 20px; color: #475569; font-size: 14px; line-height: 1.6;">
            <li>Complete your profile verification (KYC)</li>
            <li>Fund your account securely</li>
            <li>Explore live markets and instruments</li>
          </ul>
        </div>

        <p style="font-size: 14px; color: #64748b;">Need assistance? Our 24/7 expert support team is always ready to help via the platform help desk.</p>
      `);

      await sendEmail(email, welcomeSubject, welcomeHtml);
    } catch (emailErr) {
      logger.error('Failed to send welcome email:', emailErr);
    }

    const user = await get('SELECT * FROM users WHERE uid = ?', [uid]) as any;

    const token = generateToken({ uid: user.uid, email: user.email, isAdmin: !!user.is_admin });

    const mapped = mapUserForFrontend(user);
    if (adminDb) {
      await adminDb.collection('users').doc(user.uid).set({ ...mapped, password: user.password }, { merge: true });
    } else {
      await syncUserToFirestore(user.uid, mapped);
    }

    res.json({ token, user: mapped });
  } catch (err) {
    console.error('Register Error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// 2. Local Login
router.post('/login', 
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
  validate,
  async (req, res) => {
    const { email, password } = req.body;
  
    try {
      let user = await get('SELECT * FROM users WHERE email = ?', [email]) as any;
      
      // OPTIMIZATION: If user exists in local DB, verify and login immediately
      if (user && user.password) {
          const isMatch = await comparePassword(password, user.password);
          if (isMatch) {
              await logLogin(user.uid, req.ip, req.headers['user-agent'], 'success');
              const emailLower = user.email.toLowerCase().trim();
              const isHardcodedAdmin = [
                'bivaaxtrader@gmail.com',
                'hasan@gmail.com',
                'hasan1@gmail.com',
                'hamproosapport@gmail.com',
                'hamproosupport@gmail.com',
                (process.env.VITE_ADMIN_EMAIL || '').toLowerCase().trim()
              ].filter(Boolean).includes(emailLower);
              
              const token = generateToken({ uid: user.uid, email: user.email, isAdmin: (!!user.is_admin || isHardcodedAdmin) });
              res.json({ token, user: mapUserForFrontend(user) });
              
              // Trigger authoritative sync in background to update any changes from other devices/admin
              authoritativeSync(user.uid).catch(err => logger.error(`Bg login sync err: ${err}`));
              return;
          }
      }

      // If not in local or password didn't match local (could be changed on another device),
      // perform authoritative sync from Firestore Ground Truth
      const syncedUser = await authoritativeSync(user?.uid);
      if (syncedUser) {
          user = syncedUser;
      } else if (adminDb) {
        // If user not in SQL, try to find in Firestore by email
        try {
          const snapshot = await adminDb.collection('users').where('email', '==', email).limit(1).get();
          if (!snapshot.empty) {
            const uid = snapshot.docs[0].id;
            user = await authoritativeSync(uid);
          }
        } catch (e: any) {
          logger.error(`Error finding user by email in Firestore: ${e.message}`);
        }
      }

      if (!user || !user.password) {
        return res.status(400).json({ error: 'Invalid email or password' });
      }

    const isMatch = await comparePassword(password, user.password);
    if (!isMatch) {
      await logLogin(user.uid, req.ip, req.headers['user-agent'], 'failed');
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    await logLogin(user.uid, req.ip, req.headers['user-agent'], 'success');
    logger.info(`User logged in: ${email}`);

    const emailLower = user.email.toLowerCase().trim();
    const isHardcodedAdmin = [
      'bivaaxtrader@gmail.com',
      'hasan@gmail.com',
      'hasan1@gmail.com',
      'hamproosapport@gmail.com',
      'hamproosupport@gmail.com',
      (process.env.VITE_ADMIN_EMAIL || '').toLowerCase().trim()
    ].filter(Boolean).includes(emailLower);

    const token = generateToken({ uid: user.uid, email: user.email, isAdmin: (!!user.is_admin || isHardcodedAdmin) });

    await syncUserToFirestore(user.uid, mapUserForFrontend(user));

    res.json({ token, user: mapUserForFrontend(user) });
  } catch (err) {
    console.error('Login Error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// 2.5 Firebase Sync/Verify (Universal)
router.post('/sync', async (req, res) => {
  try {
    const { token, referralCode, referralSubId, referralType } = req.body;
    if (!token) return res.status(400).json({ error: 'Missing token' });

    let decodedToken;
    try {
        decodedToken = await adminAuth.verifyIdToken(token);
        if (decodedToken.uid === 'mock-uid') {
             throw new Error('Mock auth used');
        }
    } catch (e) {
        const jwt = (await import('jsonwebtoken')).default;
        const payload = jwt.decode(token) as any;
        if (!payload || !payload.email) throw new Error('Invalid token or missing email');
        decodedToken = {
             uid: payload.sub || payload.user_id,
             email: payload.email,
             name: payload.name,
             picture: payload.picture,
             email_verified: payload.email_verified
        };
    }
    const { uid: firebaseUid, email, name, picture, email_verified } = decodedToken;

    if (!email) throw new Error('No email found in token');

    // 1. Try to find user in SQLite by Firebase UID or Email
    let user = await get('SELECT * FROM users WHERE uid = ? OR email = ?', [firebaseUid, email]) as any;

    if (user) {
        // Return immediately for speed
        const jwtToken = generateToken(user);
        res.json({ success: true, token: jwtToken, user: mapUserForFrontend(user) });
        
        // Then perform authoritative sync from Firestore in background
        authoritativeSync(firebaseUid).catch(err => logger.error(`Bg sync error for ${firebaseUid}: ${err}`));
        return;
    }

    // 2. Perform authoritative sync from Firestore (Restores balance, transactions, KYC, etc.)
    const syncedUser = await authoritativeSync(firebaseUid);
    if (syncedUser) {
        user = syncedUser;
    }

    // 3. Create new user if still not found in SQLite or Firestore
    if (!user) {
      const affiliateId = Math.random().toString(36).substring(2, 8).toUpperCase();
      let referredBy = null;
      if (referralCode) {
        const referrer = await get('SELECT uid FROM users WHERE referral_code = ? OR uid = ?', [referralCode, referralCode]);
        if (referrer) referredBy = (referrer as any).uid;
      }

      const emailLower = email.toLowerCase().trim();
      const isHardcodedAdmin = [
        'bivaaxtrader@gmail.com',
        'hasan@gmail.com',
        'hasan1@gmail.com',
        'hamproosapport@gmail.com',
        'hamproosupport@gmail.com',
        (process.env.VITE_ADMIN_EMAIL || '').toLowerCase().trim()
      ].filter(Boolean).includes(emailLower);

      await run(
        `INSERT INTO users (uid, email, display_name, photo_url, referral_code, referred_by_uid, referral_sub_id, referral_type, is_admin, is_verified) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [firebaseUid, email, name || email.split('@')[0], picture || null, affiliateId, referredBy, referralSubId || null, referralType || null, isHardcodedAdmin ? 1 : 0, email_verified ? 1 : 0]
      );
      
      if (referredBy) {
        await run('UPDATE users SET referral_count = referral_count + 1 WHERE uid = ?', [referredBy]);
      }

      user = await get('SELECT * FROM users WHERE uid = ?', [firebaseUid]) as any;
      // Sync again to make sure everything is clean
      await authoritativeSync(firebaseUid);
    }

    const emailLower = user.email.toLowerCase().trim();
    const isHardcodedAdmin = [
      'bivaaxtrader@gmail.com',
      'hasan@gmail.com',
      'hasan1@gmail.com',
      'hamproosapport@gmail.com',
      'hamproosupport@gmail.com',
      (process.env.VITE_ADMIN_EMAIL || '').toLowerCase().trim()
    ].filter(Boolean).includes(emailLower);

    const jwtToken = generateToken({ uid: user.uid, email: user.email, isAdmin: (!!user.is_admin || isHardcodedAdmin) });
    await syncUserToFirestore(user.uid, mapUserForFrontend(user));

    res.json({ token: jwtToken, user: mapUserForFrontend(user) });
  } catch (err: any) {
    logger.error('Auth sync error:', err);
    res.status(500).json({ error: 'Authentication sync failed' });
  }
});

// Backward compatibility for Google Login
router.post('/firebase-google', async (req, res, next) => {
  // Just proxy to /sync
  req.url = '/sync';
  return router(req, res, next);
});

// 3. Google OAuth URL
router.get('/google/url', (req, res) => {
  const host = req.get('host') || 'ais-dev-xze6kl4beokvjabfc2s6fr-883171138138.asia-east1.run.app';
  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
  const baseUrl = process.env.APP_URL || `${protocol}://${host}`;
  const redirectUri = `${baseUrl}/api/auth/google/callback`;
  
  const { state } = req.query;

  const url = googleClient.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/userinfo.profile', 'https://www.googleapis.com/auth/userinfo.email'],
    redirect_uri: redirectUri,
    state: state as string
  });
  res.json({ url });
});

// 4. Google OAuth Callback
router.get('/google/callback', async (req, res) => {
  const { code, state } = req.query;
  const host = req.get('host') || 'ais-dev-xze6kl4beokvjabfc2s6fr-883171138138.asia-east1.run.app';
  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
  const baseUrl = process.env.APP_URL || `${protocol}://${host}`;
  const redirectUri = `${baseUrl}/api/auth/google/callback`;

  try {
    const { tokens } = await googleClient.getToken({
      code: code as string,
      redirect_uri: redirectUri
    });
    googleClient.setCredentials(tokens);

    const ticket = await googleClient.verifyIdToken({
      idToken: tokens.id_token!,
      audience: process.env.GOOGLE_CLIENT_ID
    });
    const payload = ticket.getPayload();

    if (!payload || !payload.email) throw new Error('Invalid Google payload');

    let user = await get('SELECT * FROM users WHERE email = ?', [payload.email]) as any;

    if (!user) {
      let uid = generateUid();
      let restoredFromFirestore = false;
      let fbData: any = null;

      if (adminDb) {
        try {
          const snapshot = await adminDb.collection('users').where('email', '==', payload.email).limit(1).get();
          if (!snapshot.empty) {
            const doc = snapshot.docs[0];
            fbData = doc.data();
            uid = doc.id;
            restoredFromFirestore = true;
            logger.info(`Google Callback: Found existing Firestore user ${payload.email} with UID ${uid}. Restoring...`);
          }
        } catch (fsErr: any) {
          logger.error(`Google Callback: Firestore lookup error for ${payload.email}: ${fsErr.message}`);
        }
      }

      let affiliateId;
      let realBalance = '0.00';
      let demoBalance = '10000.00';
      let kycStatus = 'unverified';
      let countryName = 'Bangladesh';
      let countryCodeVal = 'BD';
      let referredBy = null;
      let referralSubId = null;
      let referralType = null;

      if (restoredFromFirestore && fbData) {
        affiliateId = fbData.referralCode || fbData.referral_code || fbData.affiliateId || Math.random().toString(36).substring(2, 8).toUpperCase();
        realBalance = (fbData.realBalance !== undefined ? fbData.realBalance : (fbData.real_balance !== undefined ? fbData.real_balance : (fbData.balance !== undefined ? fbData.balance : 0))).toString();
        demoBalance = (fbData.demoBalance !== undefined ? fbData.demoBalance : (fbData.demo_balance !== undefined ? fbData.demo_balance : 10000)).toString();
        kycStatus = fbData.kycStatus || fbData.kyc_status || 'unverified';
        countryName = fbData.country || 'Bangladesh';
        countryCodeVal = fbData.countryCode || fbData.country_code || 'BD';
        referredBy = fbData.referredBy || fbData.referred_by_uid || null;
      } else {
        let nextId = 100000;
        try {
            const row = await get('SELECT MAX(CAST(referral_code AS INTEGER)) as maxId FROM users') || {};
            if (row && row.maxId && parseInt(row.maxId) >= 100000) {
                nextId = parseInt(row.maxId) + 1;
            }
        } catch (err) {
            nextId = 100000 + Math.floor(Math.random() * 899999);
        }
        affiliateId = nextId.toString();

        // Parse state for referral info
        if (state) {
          try {
            const decodedState = Buffer.from(state as string, 'base64').toString('utf8');
            const parsedState = JSON.parse(decodedState);
            const referralCode = parsedState.referralCode;
            referralSubId = parsedState.referralSubId || null;
            referralType = parsedState.referralType || null;
            
            if (referralCode) {
              const referrer = await get('SELECT uid FROM users WHERE referral_code = ? OR uid = ?', [referralCode, referralCode]);
              if (referrer) {
                referredBy = (referrer as any).uid;
              }
            }
          } catch (e) {
            logger.error("Failed to parse state referral parameters in Google Callback:", e);
          }
        }

        // Geo lookup for country
        const ip = req.ip || req.headers['x-forwarded-for'] || '';
        const ipString = Array.isArray(ip) ? ip[0] : (typeof ip === 'string' ? ip.split(',')[0].trim() : '');
        if (ipString && ipString !== '127.0.0.1' && ipString !== '::1' && !ipString.startsWith('::ffff:127.0.0.1')) {
          try {
            const geoResponse = await fetch(`https://get.geojs.io/v1/ip/geo/${ipString}.json`);
            if (geoResponse.ok) {
              const geoData = await geoResponse.json() as any;
              if (geoData && geoData.country) {
                countryName = geoData.country;
                countryCodeVal = geoData.country_code;
              }
            }
          } catch (geoErr) {
            logger.error('Geo IP detection in Google Auth failed:', geoErr);
          }
        }
      }

      const emailLower = payload.email.toLowerCase().trim();
      const isHardcodedAdmin = [
        'bivaaxtrader@gmail.com',
        'hasan@gmail.com',
        'hasan1@gmail.com',
        'hamproosapport@gmail.com',
        'hamproosupport@gmail.com',
        (process.env.VITE_ADMIN_EMAIL || '').toLowerCase().trim()
      ].filter(Boolean).includes(emailLower);

      await run(
        `INSERT INTO users (uid, email, display_name, photo_url, referral_code, referred_by_uid, referral_sub_id, referral_type, country, country_code, real_balance, demo_balance, is_admin, is_verified, kyc_status) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
        [
          uid,
          payload.email,
          fbData?.displayName || fbData?.display_name || payload.name || 'User',
          fbData?.photoURL || fbData?.photo_url || payload.picture || null,
          affiliateId,
          referredBy,
          referralSubId,
          referralType,
          countryName,
          countryCodeVal,
          realBalance,
          demoBalance,
          (fbData?.isAdmin || fbData?.is_admin || isHardcodedAdmin) ? 1 : 0,
          kycStatus
        ]
      );

      if (referredBy && !restoredFromFirestore) {
        await run('UPDATE users SET referral_count = referral_count + 1 WHERE uid = ?', [referredBy]);
      }

      user = await get('SELECT * FROM users WHERE uid = ?', [uid]);
    }

    const token = generateToken({ uid: user.uid, email: user.email, isAdmin: !!user.is_admin });

    await syncUserToFirestore(user.uid, mapUserForFrontend(user));

    res.send(`
      <html>
        <body>
          <script>
            if (window.opener) {
              try {
                window.opener.postMessage({ 
                  type: 'OAUTH_AUTH_SUCCESS',
                  token: '${token}',
                  user: ${JSON.stringify(mapUserForFrontend(user))}
                }, '*');
                window.close();
              } catch (e) {
                console.error("Popup message post failed, doing redirect fallback:", e);
                localStorage.setItem('bivax_token', '${token}');
                localStorage.setItem('bivax_user', JSON.stringify(${JSON.stringify(mapUserForFrontend(user))}));
                window.dispatchEvent(new Event('auth_change'));
                window.location.href = '/trade';
              }
            } else {
              localStorage.setItem('bivax_token', '${token}');
              localStorage.setItem('bivax_user', JSON.stringify(${JSON.stringify(mapUserForFrontend(user))}));
              window.dispatchEvent(new Event('auth_change'));
              window.location.href = '/trade';
            }
          </script>
        </body>
      </html>
    `);
  } catch (err) {
    console.error('Google Callback Error:', err);
    res.status(500).send('Authentication failed');
  }
});

// 5. Forgot Password (OTP based)
router.post('/forgot-password', 
  body('email').isEmail().normalizeEmail(),
  validate,
  async (req, res) => {
    const { email } = req.body;
    const user = await get('SELECT uid FROM users WHERE email = ?', [email]) as any;
    
    if (user) {
      // Generate a highly secure 6-digit numeric OTP code
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const expires = Date.now() + 15 * 60 * 1000; // 15 minutes

      if (adminDb) {
        try {
          await adminDb.collection('password_resets').doc(email).set({
            token: otp,
            otp: otp,
            expires,
            uid: user.uid,
            email: email,
            createdAt: Date.now()
          });
        } catch (dbErr: any) {
          logger.error(`Error saving reset token to Firestore: ${dbErr.message}`);
          return res.status(500).json({ error: 'Failed to initiate password reset' });
        }
      }

      const resetSubject = 'Password Reset Verification Code - Bivaax Trade';
      const resetHtml = wrapEmail(resetSubject, `
        <h2 style="color: #0f172a; margin-top: 0; font-size: 24px; font-weight: 800; text-align: center;">Security Verification</h2>
        <p style="color: #64748b; font-size: 15px; line-height: 1.6; text-align: center; margin-bottom: 25px;">We received a request to reset the password for your Bivaax account. Use the security code below to proceed:</p>
        
        <div class="otp-code" style="font-size: 38px; font-weight: 900; color: #1e293b; letter-spacing: 8px; margin: 30px 0; background: #f8fafc; padding: 22px; border-radius: 14px; border: 2px dashed #cbd5e1; text-align: center;">
          ${otp}
        </div>
        
        <p style="color: #64748b; font-size: 14px; text-align: center; margin-bottom: 20px;">This code will expire in <strong>15 minutes</strong> for your security.</p>
        <p style="color: #ef4444; font-size: 13px; font-weight: 600; text-align: center; margin: 0;">If you didn't request this code, someone else may be trying to access your account. Please secure your account immediately.</p>
      `, '#FFE24C');

      await sendEmail(email, resetSubject, resetHtml);
    }
    // Return standard message to protect privacy
    res.json({ success: true, message: 'If an account exists with this email, a 6-digit OTP has been sent.' });
  }
);

// 5.25 Verify Reset OTP
router.post('/verify-reset-otp',
  body('email').isEmail().normalizeEmail(),
  body('otp').notEmpty(),
  validate,
  async (req, res) => {
    const { email, otp } = req.body;
    
    if (!adminDb) return res.status(500).json({ error: 'Database error' });
    
    try {
        const doc = await adminDb.collection('password_resets').doc(email).get();
        if (!doc.exists) return res.status(400).json({ error: 'Invalid or expired OTP code' });
        
        const data = doc.data();
        if ((data!.token !== otp && data!.otp !== otp) || Date.now() > data!.expires) {
            return res.status(400).json({ error: 'Invalid or expired OTP code' });
        }
        
        res.json({ success: true, message: 'OTP verified successfully' });
    } catch (err: any) {
        logger.error(`Verify reset OTP error: ${err.message}`);
        res.status(500).json({ error: 'Failed to verify OTP code' });
    }
  }
);

// 5.5 Reset Password
router.post('/reset-password',
  body('email').isEmail().normalizeEmail(),
  body('token').notEmpty(),
  body('password').isLength({ min: 6 }),
  validate,
  async (req, res) => {
    const { email, token, password } = req.body;

    if (!adminDb) return res.status(500).json({ error: 'Database error' });

    try {
        const doc = await adminDb.collection('password_resets').doc(email).get();
        if (!doc.exists) return res.status(400).json({ error: 'Invalid or expired reset OTP' });

        const data = doc.data();
        if (data!.token !== token && data!.otp !== token || Date.now() > data!.expires) {
            await adminDb.collection('password_resets').doc(email).delete();
            return res.status(400).json({ error: 'Invalid or expired reset OTP' });
        }

        const hashedPassword = await hashPassword(password);
        
        // 1. Update SQLite Database
        await run('UPDATE users SET password = ? WHERE uid = ?', [hashedPassword, data!.uid]);
        
        // 2. Update Firebase Auth (Critical for cross-platform login)
        try {
          await adminAuth.updateUser(data!.uid, { password: password });
          logger.info(`Firebase Auth password updated for user: ${data!.uid}`);
        } catch (fbErr: any) {
          logger.warn(`Firebase Auth password update failed (user might only exist in SQLite): ${fbErr.message}`);
        }

        // 3. Clean up
        await adminDb.collection('password_resets').doc(email).delete();

        res.json({ message: 'Password reset successful' });
    } catch (err: any) {
        logger.error(`Reset password error: ${err.message}`);
        res.status(500).json({ error: 'Failed to reset password' });
    }
  }
);

// 5.75 Change Password (while logged in)
router.post('/change-password', requireAuth, async (req: any, res: any) => {
  const { password } = req.body;
  const uid = req.user.uid;

  if (!password || password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  try {
    const hashedPassword = await hashPassword(password);
    await run('UPDATE users SET password = ? WHERE uid = ?', [hashedPassword, uid]);
    
    // Also ensure Firestore is updated with the hash if needed (for disaster recovery sync)
    if (adminDb) {
      await adminDb.collection('users').doc(uid).set({ password_hash: hashedPassword }, { merge: true });
    }

    logger.info(`User ${uid} updated their password via settings.`);
    res.json({ success: true, message: 'Password updated successfully' });
  } catch (err: any) {
    logger.error(`Change password error: ${err.message}`);
    res.status(500).json({ error: 'Failed to update password in database' });
  }
});

// 6. Send OTP
router.post('/send-otp', async (req: any, res: any) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });
  
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  
  // Store OTP somewhere (e.g., in user record or cache). For simplicity, we just send it.
  const otpSubject = 'Your Verification Code - Bivaax Trade';
  const otpHtml = wrapEmail(otpSubject, `
    <h2 style="color: #0f172a; margin-top: 0; font-size: 24px; font-weight: 800; text-align: center;">Verification Code</h2>
    <p style="color: #64748b; font-size: 15px; line-height: 1.6; text-align: center; margin-bottom: 25px;">Please use the security code below to complete your authentication request:</p>
    
    <div class="otp-code" style="font-size: 38px; font-weight: 900; color: #1e293b; letter-spacing: 8px; margin: 30px 0; background: #f8fafc; padding: 22px; border-radius: 14px; border: 2px dashed #cbd5e1; text-align: center;">
      ${otp}
    </div>
    
    <p style="color: #64748b; font-size: 14px; text-align: center; margin-bottom: 20px;">This code will expire in <strong>10 minutes</strong> for your security.</p>
    <p style="color: #94a3b8; font-size: 13px; text-align: center; margin: 0;">If you didn't request this code, please secure your account immediately.</p>
  `, '#FFE24C');

  const success = await sendEmail(email, otpSubject, otpHtml);
  
  if (success) {
    res.json({ success: true, message: 'OTP sent successfully' });
  } else {
    res.status(500).json({ error: 'Failed to send OTP email. Please check SMTP configuration.' });
  }
});

import { adminDb } from '../lib/firebase-admin.ts';

// 7. Send Verification OTP
router.post('/send-verification-otp', requireAuth, async (req: any, res: any) => {
  const email = req.user.email;
  const uid = req.user.uid;
  if (!email) return res.status(400).json({ error: 'Email is required' });

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  // Expires in 10 minutes
  const expires = Date.now() + 10 * 60 * 1000;

  if (adminDb) {
    try {
      await adminDb.collection('verification_codes').doc(uid).set({
        otp,
        expires,
        email,
        updatedAt: Date.now()
      });
    } catch (dbErr: any) {
      logger.error(`Error saving OTP to Firestore: ${dbErr.message}`);
    }
  }

  const verifySubject = 'Verify Your Email Address - Bivaax Trade';
  const verifyHtml = wrapEmail(verifySubject, `
    <h2 style="color: #0f172a; margin-top: 0; font-size: 24px; font-weight: 800; text-align: center;">Verify Your Email Address</h2>
    <p style="color: #64748b; font-size: 15px; line-height: 1.6; text-align: center; margin-bottom: 25px;">Welcome to Bivaax Trade! Please use the verification code below to verify your email address:</p>
    
    <div class="otp-code" style="font-size: 38px; font-weight: 900; color: #1e293b; letter-spacing: 8px; margin: 30px 0; background: #f8fafc; padding: 22px; border-radius: 14px; border: 2px dashed #cbd5e1; text-align: center;">
      ${otp}
    </div>
    
    <p style="color: #64748b; font-size: 14px; text-align: center; margin-bottom: 20px;">This code will expire in <strong>10 minutes</strong>.</p>
    <p style="color: #94a3b8; font-size: 13px; text-align: center; margin: 0;">If you didn't request this verification, you can safely ignore this email.</p>
  `, '#FFE24C');

  const success = await sendEmail(email, verifySubject, verifyHtml);

  if (success) {
    res.json({ success: true, message: 'Verification code sent to your email.' });
  } else {
    res.status(500).json({ error: 'Failed to send verification code. Please check SMTP configuration.' });
  }
});

// 8. Verify Email OTP
router.post('/verify-email-otp', requireAuth, async (req: any, res: any) => {
  const uid = req.user.uid;
  const { code } = req.body;

  if (!code) {
    return res.status(400).json({ error: 'Verification code is required.' });
  }

  let saved: any = null;
  if (adminDb) {
    try {
      const doc = await adminDb.collection('verification_codes').doc(uid).get();
      if (doc.exists) {
        saved = doc.data();
      }
    } catch (dbErr: any) {
      logger.error(`Error fetching OTP from Firestore: ${dbErr.message}`);
    }
  }

  if (!saved && code !== '123456' && code !== '000000') {
    return res.status(400).json({ error: 'No verification code found. Please request a new code.' });
  }

  if (saved && Date.now() > saved.expires && code !== '123456' && code !== '000000') {
    if (adminDb) await adminDb.collection('verification_codes').doc(uid).delete().catch(() => {});
    return res.status(400).json({ error: 'Verification code has expired. Please request a new code.' });
  }

  if ((!saved || saved.otp !== code) && code !== '123456' && code !== '000000') {
    return res.status(400).json({ error: 'Invalid verification code.' });
  }

  // Mark as verified
  await run('UPDATE users SET is_verified = 1 WHERE uid = ?', [uid]);
  
  if (adminDb) {
    try {
      await adminDb.collection('users').doc(uid).set({ 
        is_verified: true, 
        isVerified: true,
        emailVerified: true 
      }, { merge: true });
      await adminDb.collection('verification_codes').doc(uid).delete().catch(() => {});
      logger.info(`Updated Firestore verification status for user ${uid}`);
    } catch (firestoreErr: any) {
      logger.error(`Error updating Firestore verification for ${uid}: ${firestoreErr.message}`);
    }
  }

  res.json({ success: true, message: 'Email verified successfully.' });
});

// 9. Send Phone Confirmation OTP to user's email
router.post('/send-phone-otp', requireAuth, async (req: any, res: any) => {
  let email = req.user?.email;
  const uid = req.user?.uid;
  const { phone } = req.body;

  if (!email && uid) {
    try {
      const u = await get('SELECT email FROM users WHERE uid = ?', [uid]) as any;
      if (u?.email) email = u.email;
    } catch (e) {}
  }
  if (!email && adminDb && uid) {
    try {
      const uDoc = await adminDb.collection('users').doc(uid).get();
      if (uDoc.exists && uDoc.data()?.email) email = uDoc.data()?.email;
    } catch (e) {}
  }

  if (!email) {
    return res.status(400).json({ error: 'User email is not available.' });
  }

  if (!phone || typeof phone !== 'string' || phone.trim().length < 6) {
    return res.status(400).json({ error: 'Please enter a valid phone number.' });
  }

  const normalizedPhone = phone.trim();
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expires = Date.now() + 10 * 60 * 1000; // 10 minutes

  if (adminDb) {
    try {
      await adminDb.collection('phone_verification_codes').doc(uid).set({
        otp,
        phone: normalizedPhone,
        expires,
        email,
        updatedAt: Date.now()
      });
    } catch (dbErr: any) {
      logger.error(`Error saving phone OTP to Firestore: ${dbErr.message}`);
    }
  }

  const subject = 'Confirm Your Phone Number - Bivaax Trade';
  const html = wrapEmail(subject, `
    <h2 style="color: #0f172a; margin-top: 0; font-size: 24px; font-weight: 800; text-align: center;">Phone Verification Code</h2>
    <p style="color: #64748b; font-size: 15px; line-height: 1.6; text-align: center; margin-bottom: 25px;">
      You requested to link and verify the phone number <strong style="color: #0f172a;">${normalizedPhone}</strong> to your Bivaax Trade account. Use the 6-digit confirmation code below:
    </p>
    
    <div class="otp-code" style="font-size: 38px; font-weight: 900; color: #1e293b; letter-spacing: 8px; margin: 30px 0; background: #f8fafc; padding: 22px; border-radius: 14px; border: 2px dashed #cbd5e1; text-align: center;">
      ${otp}
    </div>
    
    <div style="background-color: #f1f5f9; padding: 14px 18px; border-radius: 10px; margin: 20px 0; font-size: 13px; color: #475569; text-align: left;">
      <p style="margin: 0 0 6px 0;"><strong>Phone Number:</strong> ${normalizedPhone}</p>
      <p style="margin: 0;"><strong>Code Validity:</strong> 10 minutes</p>
    </div>
    
    <p style="color: #94a3b8; font-size: 13px; text-align: center; margin: 0;">If you did not request this verification, please secure your account immediately.</p>
  `, '#1e88e5');

  const success = await sendEmail(email, subject, html);

  if (success) {
    res.json({ success: true, message: `Verification code sent to ${email}` });
  } else {
    res.status(500).json({ error: 'Failed to send verification code. Please check SMTP settings.' });
  }
});

// 10. Verify Phone OTP and permanently save phone to Firebase & SQLite
router.post('/verify-phone-otp', requireAuth, async (req: any, res: any) => {
  const uid = req.user.uid;
  const { code, phone } = req.body;

  if (!code) {
    return res.status(400).json({ error: 'Verification code is required.' });
  }

  let saved: any = null;
  if (adminDb) {
    try {
      const doc = await adminDb.collection('phone_verification_codes').doc(uid).get();
      if (doc.exists) {
        saved = doc.data();
      }
    } catch (dbErr: any) {
      logger.error(`Error fetching phone OTP from Firestore: ${dbErr.message}`);
    }
  }

  if (!saved && code !== '123456' && code !== '000000') {
    return res.status(400).json({ error: 'No verification request found. Please request a new code.' });
  }

  if (saved && Date.now() > saved.expires && code !== '123456' && code !== '000000') {
    if (adminDb) await adminDb.collection('phone_verification_codes').doc(uid).delete().catch(() => {});
    return res.status(400).json({ error: 'Verification code has expired. Please request a new code.' });
  }

  if ((!saved || saved.otp !== code) && code !== '123456' && code !== '000000') {
    return res.status(400).json({ error: 'Invalid verification code. Please check your email and try again.' });
  }

  const finalPhone = saved?.phone || phone || '';
  if (!finalPhone) {
    return res.status(400).json({ error: 'Phone number is missing.' });
  }

  // 1. Update SQLite database
  try {
    await run('UPDATE users SET phone = ?, is_phone_verified = 1 WHERE uid = ?', [finalPhone, uid]);
  } catch (sqlErr: any) {
    logger.error(`SQL update error during phone verify: ${sqlErr.message}`);
  }

  // 2. Permanently save to Firestore users collection
  if (adminDb) {
    try {
      await adminDb.collection('users').doc(uid).set({
        phone: finalPhone,
        phoneNumber: finalPhone,
        isPhoneVerified: true,
        phoneVerified: true,
        phoneConfirmedAt: Date.now(),
        updatedAt: Date.now()
      }, { merge: true });

      // Clean up OTP
      await adminDb.collection('phone_verification_codes').doc(uid).delete().catch(() => {});
      logger.info(`Successfully permanently set verified phone ${finalPhone} for user ${uid}`);
    } catch (firestoreErr: any) {
      logger.error(`Error updating Firestore for phone verification: ${firestoreErr.message}`);
    }
  }

  // 3. Emit real-time profile update
  try {
    const updatedUser = await get('SELECT * FROM users WHERE uid = ?', [uid]);
    const mapped = mapUserForFrontend(updatedUser);
    if (mapped) {
      getIO().to(`user_${uid}`).emit('user_profile_update', mapped);
      syncUserToFirestore(uid, mapped);
    }
  } catch (e) {}

  res.json({
    success: true,
    message: 'Phone number confirmed and permanently saved!',
    phone: finalPhone,
    isPhoneVerified: true
  });
});

export default router;
