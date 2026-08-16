import nodemailer from 'nodemailer';
import { Resend } from 'resend';
import { adminDb } from './firebase-admin.ts';
import logger from './logger.ts';

// In-memory deduplication cache to prevent sending the exact same email multiple times
const recentEmailsMap = new Map<string, number>();

// Periodic cleanup of stale cache keys
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamp] of recentEmailsMap.entries()) {
    if (now - timestamp > 120000) {
      recentEmailsMap.delete(key);
    }
  }
}, 60000);

export async function sendEmail(to: string, subject: string, html: string, text?: string, overrideConfig?: any) {
  try {
    const cleanTo = (to || '').trim().toLowerCase();
    const cleanSubject = (subject || '').trim();

    // Deduplication check: Do not send the same email to the same user repeatedly within 30 seconds
    const isTest = overrideConfig || cleanSubject.toLowerCase().includes('connection test');
    const dedupeKey = `${cleanTo}::${cleanSubject}`;
    const now = Date.now();

    if (!isTest && cleanTo && cleanSubject) {
      const lastSent = recentEmailsMap.get(dedupeKey);
      if (lastSent && (now - lastSent) < 30000) {
        logger.info(`[Email Deduplication] Suppressed duplicate email to ${cleanTo} with subject "${cleanSubject}" (sent ${Math.round((now - lastSent)/1000)}s ago)`);
        return true;
      }
      // Record this send immediately to prevent concurrent duplicates
      recentEmailsMap.set(dedupeKey, now);
    }

    // Ensure email HTML is wrapped in a clean, professional, mobile-friendly template if not already wrapped
    let finalHtml = html;
    if (!finalHtml.includes('<!DOCTYPE html>') && !finalHtml.includes('<html')) {
      finalHtml = wrapEmail(subject, html);
    }

    let dbConfig: any = {};
    if (overrideConfig) {
      dbConfig = overrideConfig;
    } else {
      const settingsDoc = await adminDb.collection('app_config').doc('settings').get();
      dbConfig = settingsDoc.data() || {};
    }

    const smtpFromEmail = dbConfig.smtpFromEmail || process.env.SMTP_FROM_EMAIL || "bivaaxtrader@gmail.com";
    const smtpFromName = dbConfig.smtpFromName || process.env.SMTP_FROM_NAME || "Bivaax Trade";

    // 2. Check for Resend API Key (Highly Recommended for deliverability)
    const resendApiKey = dbConfig.resendApiKey || process.env.RESEND_API_KEY;
    const isValidResendKey = resendApiKey && typeof resendApiKey === 'string' && resendApiKey.startsWith('re_') && resendApiKey.length > 15;
    
    if (isValidResendKey && !overrideConfig) {
      try {
        const resend = new Resend(resendApiKey);
        
        const isPublicDomain = smtpFromEmail.toLowerCase().includes('gmail.com') || 
                              smtpFromEmail.toLowerCase().includes('yahoo.com') || 
                              smtpFromEmail.toLowerCase().includes('outlook.com');

        const fromAddressForResend = isPublicDomain 
          ? `Bivaax Trade <onboarding@resend.dev>` 
          : `${smtpFromName} <${smtpFromEmail}>`;

        const { data, error } = await resend.emails.send({
          from: fromAddressForResend,
          to: [to],
          subject: subject,
          html: finalHtml,
          text: text || finalHtml.replace(/<[^>]*>?/gm, '').replace(/\s+/g, ' ').trim(),
          headers: {
            'X-Entity-Ref-ID': Date.now().toString(),
          }
        });

        if (error) {
          logger.error('Resend API error:', error);
          if (error.name === 'validation_error') {
            logger.warn('Resend validation error (likely domain or recipient restriction). Falling back to SMTP...');
          }
          throw new Error('Resend API failed: ' + JSON.stringify(error));
        } else {
          logger.info(`Email sent via Resend: ${data?.id}`);
          return true;
        }
      } catch (resendErr: any) {
        logger.error('Resend failed, falling back to SMTP:', resendErr);
        if (overrideConfig) {
          throw resendErr;
        }
      }
    }

    // 3. Fallback to SMTP
    let smtpHost = "";
    let smtpPort = 587;
    let smtpUser = "";
    let smtpPass = "";

    if (dbConfig.smtpHost) {
      smtpHost = dbConfig.smtpHost;
      smtpPort = Number(dbConfig.smtpPort) || 587;
      smtpUser = dbConfig.smtpUser || "";
      smtpPass = dbConfig.smtpPass || "";
    } else if (process.env.SMTP_HOST) {
      smtpHost = process.env.SMTP_HOST;
      smtpPort = Number(process.env.SMTP_PORT) || 587;
      smtpUser = process.env.SMTP_USER || "";
      smtpPass = process.env.SMTP_PASS || "";
    } else {
      // Brevo fallback
      smtpHost = "smtp-relay.brevo.com";
      smtpPort = 587;
      smtpUser = "bivaaxtrader@gmail.com";
      smtpPass = "xsmtpsib-cb40d4386d54bad7f591fab86f4399e1bbddfadb556eb614d7a425d1006568b6-QpwLzh4XotgcuyYY";
    }

    const config = {
      smtpHost,
      smtpPort,
      smtpUser,
      smtpPass,
      smtpFromEmail,
      smtpFromName
    };
    
    if (!config.smtpHost || !config.smtpPort || !config.smtpUser || !config.smtpPass) {
      const errMsg = 'SMTP configuration is missing. Cannot send email to ' + to;
      logger.warn(errMsg);
      if (overrideConfig) throw new Error(errMsg);
      return false;
    }

    const transporter = nodemailer.createTransport({
      host: config.smtpHost,
      port: Number(config.smtpPort),
      secure: Number(config.smtpPort) === 465,
      auth: {
        user: config.smtpUser,
        pass: config.smtpPass,
      },
      connectionTimeout: 15000, 
      greetingTimeout: 15000,
      socketTimeout: 30000,
      tls: {
        rejectUnauthorized: false
      }
    });

    const fromAddress = `"${config.smtpFromName || 'Bivaax Trade'}" <${config.smtpFromEmail || config.smtpUser}>`;

    const info = await transporter.sendMail({
      from: fromAddress,
      to,
      subject,
      html: finalHtml,
      text: text || finalHtml.replace(/<[^>]*>?/gm, '').replace(/\s+/g, ' ').trim(),
      headers: {
        'X-Priority': '1 (Highest)',
        'X-MSMail-Priority': 'High',
        'X-Mailer': 'Bivaax Engine',
        'Feedback-ID': 'bivaax-trade:otp:reset'
      }
    });

    logger.info(`Email sent via SMTP: ${info.messageId}`);
    return true;
  } catch (error: any) {
    logger.error('Error sending email:', error);
    
    if (overrideConfig) {
      throw error;
    }

    console.log("\n======================================================================");
    console.log("📢 RESILIENCY FALLBACK: EMAIL TRANSIT FAILED BUT LOGGED TO CONSOLE");
    console.log("----------------------------------------------------------------------");
    console.log(`TO      : ${to}`);
    console.log(`SUBJECT : ${subject}`);
    console.log("----------------------------------------------------------------------");
    
    const otpMatch = html.match(/\b\d{6}\b/);
    if (otpMatch) {
      console.log(`🔑 DETECTED OTP / SECURITY CODE: ${otpMatch[0]}`);
    }
    
    console.log("BODY EXCERPT:");
    const cleanText = text || html.replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim();
    console.log(cleanText.substring(0, 400) + (cleanText.length > 400 ? "..." : ""));
    console.log("======================================================================\n");

    return true;
  }
}

export function wrapEmail(title: string, bodyContent: string, accentColor = '#FFE24C') {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title}</title>
      <style>
        /* Modern, clean base styles */
        body {
          -webkit-text-size-adjust: 100%;
          -ms-text-size-adjust: 100%;
          margin: 0;
          padding: 0;
          width: 100% !important;
          background-color: #f4f6f8;
        }
        
        /* Ultra-responsive media query that flattens all nested double paddings on mobile */
        @media only screen and (max-width: 600px) {
          /* Full-width container reset */
          .email-container {
            width: 100% !important;
            max-width: 100% !important;
            border-radius: 0 !important;
            border: none !important;
            box-shadow: none !important;
          }
          
          /* Flatten out outer cell padding */
          .content-box {
            padding: 0 !important;
          }
          
          .header-box {
            padding: 25px 15px !important;
            border-radius: 0 !important;
          }
          
          /* Flatten double-wrapped inline styled containers from custom route HTML templates */
          div[style*="max-w: 600px"], 
          div[style*="max-width: 600px"],
          div[style*="margin: 0 auto"],
          div[style*="padding: 20px"],
          div[style*="padding:20px"] {
            width: 100% !important;
            max-width: 100% !important;
            padding: 0 !important;
            margin: 0 !important;
            box-sizing: border-box !important;
            border: none !important;
            border-radius: 0 !important;
            background-color: transparent !important;
          }
          
          /* Force nested custom cards & banners to look perfect and wide on mobile */
          div[style*="padding: 40px"], 
          div[style*="padding:40px"],
          div[style*="padding: 30px"],
          div[style*="padding:30px"],
          td[style*="padding: 40px"],
          td[style*="padding:40px"] {
            padding: 24px 16px !important;
            border-radius: 0 !important;
            box-sizing: border-box !important;
          }
          
          /* Reduce huge font sizes on headers */
          h1 {
            font-size: 22px !important;
          }
          h2 {
            font-size: 18px !important;
          }
          
          /* OTP Code block responsiveness */
          .otp-code {
            font-size: 28px !important;
            letter-spacing: 4px !important;
            padding: 12px !important;
          }
          
          /* Responsive buttons: make them comfortable to tap on mobile */
          a[style*="padding: 16px 40px"],
          a[style*="padding:16px 40px"],
          a[style*="padding: 12px 30px"],
          a[style*="padding:12px 30px"] {
            display: block !important;
            width: 100% !important;
            padding: 14px 16px !important;
            box-sizing: border-box !important;
            text-align: center !important;
            font-size: 15px !important;
          }
          
          /* Adjust info blocks */
          div[style*="padding: 25px"],
          div[style*="padding:25px"] {
            padding: 16px !important;
          }
        }
      </style>
    </head>
    <body style="margin: 0; padding: 0; background-color: #f4f6f8; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f4f6f8; width: 100%; table-layout: fixed;">
        <tr>
          <td align="center" style="padding: 25px 0;" class="outer-cell">
            <table role="presentation" class="email-container" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.04); border: 1px solid #e2e8f0;">
              <!-- Beautiful Header -->
              <tr>
                <td class="header-box" style="background-color: #111217; padding: 30px; text-align: center; border-bottom: 3px solid ${accentColor};">
                  <!-- Logo Text styling with high contrast gold and elegant sans display -->
                  <h1 style="color: ${accentColor}; margin: 0; font-size: 24px; font-weight: 800; letter-spacing: 0.5px; text-transform: uppercase; font-family: 'Segoe UI', Roboto, sans-serif;">
                    <span style="color: #ffffff;">BIVAAX</span> TRADE
                  </h1>
                  <p style="color: #94a3b8; font-size: 11px; margin: 5px 0 0; text-transform: uppercase; letter-spacing: 2px; font-weight: 700;">Global Financial & Trading Ecosystem</p>
                </td>
              </tr>
              <!-- Body Content Cell -->
              <tr>
                <td class="content-box" style="padding: 0; color: #1e293b; font-size: 15px; line-height: 1.6;">
                  ${bodyContent}
                </td>
              </tr>
              <!-- Detailed Professional Footer -->
              <tr>
                <td style="background-color: #f8fafc; padding: 30px 24px; text-align: center; border-top: 1px solid #edf2f7;">
                  <p style="margin: 0 0 8px; font-size: 12px; color: #475569; font-weight: 700; text-transform: uppercase; letter-spacing: 1px;">Bivaax Trade Security Department</p>
                  <p style="margin: 0 0 15px; font-size: 11px; color: #64748b; line-height: 1.5;">This is a secure, automated notification regarding your Bivaax trading account. To protect your security, never share your login details, OTP codes, or verification links with anyone.</p>
                  
                  <!-- Help links -->
                  <div style="margin: 15px 0 20px; font-size: 11px;">
                    <a href="https://bivaax.com/trade" style="color: #0284c7; text-decoration: none; font-weight: 600; margin: 0 10px;">Trading Desk</a> |
                    <a href="https://bivaax.com/support" style="color: #0284c7; text-decoration: none; font-weight: 600; margin: 0 10px;">Support Center</a> |
                    <a href="https://bivaax.com/privacy" style="color: #0284c7; text-decoration: none; font-weight: 600; margin: 0 10px;">Security Policy</a>
                  </div>
                  
                  <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;">
                  <p style="margin: 0; font-size: 10px; color: #94a3b8;">&copy; 2026 Bivaax Trade Financial Services Inc. All rights reserved. Registered global investment and trading platform.</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
}
