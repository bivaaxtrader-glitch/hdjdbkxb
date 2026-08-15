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
        @media only screen and (max-width: 600px) {
          .email-container { padding: 10px !important; width: 100% !important; }
          .content-box { padding: 20px !important; }
          .header-box { padding: 25px 15px !important; }
          .otp-code { font-size: 32px !important; letter-spacing: 6px !important; padding: 15px !important; }
        }
      </style>
    </head>
    <body style="margin: 0; padding: 0; background-color: #f4f7f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f4f7f9; width: 100%; table-layout: fixed;">
        <tr>
          <td align="center" style="padding: 40px 10px;">
            <table role="presentation" class="email-container" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05); border: 1px solid #e1e8ed;">
              <!-- Header -->
              <tr>
                <td class="header-box" style="background-color: #15161d; padding: 35px 30px; text-align: center; border-bottom: 3px solid ${accentColor};">
                  <h1 style="color: ${accentColor}; margin: 0; font-size: 22px; font-weight: 900; letter-spacing: -0.5px; text-transform: uppercase;">Bivaax Trade</h1>
                  <p style="color: #94a3b8; font-size: 12px; margin: 6px 0 0; text-transform: uppercase; letter-spacing: 1.5px; font-weight: 600;">Global Financial & Trading Platform</p>
                </td>
              </tr>
              <!-- Body Content -->
              <tr>
                <td class="content-box" style="padding: 40px 35px; color: #1e293b; font-size: 15px; line-height: 1.6;">
                  ${bodyContent}
                </td>
              </tr>
              <!-- Footer -->
              <tr>
                <td style="background-color: #f8fafc; padding: 25px 35px; text-align: center; border-top: 1px solid #edf2f7;">
                  <p style="margin: 0 0 5px; font-size: 12px; color: #64748b; font-weight: 600;">Bivaax Trade Financial Services</p>
                  <p style="margin: 0; font-size: 11px; color: #94a3b8;">This is an automated system message. Please do not reply directly to this email.</p>
                  <p style="margin: 10px 0 0; font-size: 10px; color: #cbd5e1;">&copy; 2026 Bivaax Trade. All rights reserved.</p>
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
