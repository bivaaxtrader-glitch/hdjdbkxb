import nodemailer from 'nodemailer';
import { Resend } from 'resend';
import { adminDb } from './firebase-admin.ts';
import logger from './logger.ts';

export async function sendEmail(to: string, subject: string, html: string, text?: string) {
  try {
    // 1. Fetch settings from Firestore FIRST (user-controlled)
    const settingsDoc = await adminDb.collection('app_config').doc('settings').get();
    const dbConfig = settingsDoc.data() || {};

    const smtpFromEmail = dbConfig.smtpFromEmail || process.env.SMTP_FROM_EMAIL || "bivaaxtrader@gmail.com";
    const smtpFromName = dbConfig.smtpFromName || process.env.SMTP_FROM_NAME || "Bivaax Trade";

    // 2. Check for Resend API Key (Highly Recommended for deliverability)
    const resendApiKey = dbConfig.resendApiKey || process.env.RESEND_API_KEY;
    
    if (resendApiKey) {
      try {
        const resend = new Resend(resendApiKey);
        
        // Resend strictly requires a verified domain to send from custom addresses.
        // If the fromEmail is a public domain like gmail.com, Resend will reject it.
        // We will try to send, and if it fails with a domain error, we skip to SMTP.
        const isPublicDomain = smtpFromEmail.toLowerCase().includes('gmail.com') || 
                              smtpFromEmail.toLowerCase().includes('yahoo.com') || 
                              smtpFromEmail.toLowerCase().includes('outlook.com');

        // Sandbox Mode Detection:
        // Resend's free/unverified tier only allows sending to the account owner's email.
        // If "to" is not the owner's email and we have a public domain, Resend will likely fail.
        const isToOwner = to.toLowerCase().trim() === smtpFromEmail.toLowerCase().trim();
        
        if (isPublicDomain && !isToOwner) {
          logger.warn(`Resend sandbox limitation: Skipping Resend for external recipient ${to} because domain is not verified. Falling back to SMTP.`);
          throw new Error('SKIPPING_RESEND_FOR_EXTERNAL_RECIPIENT');
        }

        const fromAddressForResend = isPublicDomain 
          ? `Bivaax Trade <onboarding@resend.dev>` 
          : `${smtpFromName} <${smtpFromEmail}>`;

        const { data, error } = await resend.emails.send({
          from: fromAddressForResend,
          to: [to],
          subject: subject,
          html: html,
          text: text || html.replace(/<[^>]*>?/gm, '').replace(/\s+/g, ' ').trim(),
          headers: {
            'X-Entity-Ref-ID': Date.now().toString(),
          }
        });

        if (error) {
          logger.error('Resend API error:', error);
          if (error.name === 'validation_error') {
            logger.warn('Resend validation error (likely domain or recipient restriction). Falling back to SMTP...');
          }
        } else {
          logger.info(`Email sent via Resend: ${data?.id}`);
          return true;
        }
      } catch (resendErr: any) {
        if (resendErr.message !== 'SKIPPING_RESEND_FOR_EXTERNAL_RECIPIENT') {
          logger.error('Resend failed, falling back to SMTP:', resendErr);
        }
      }
    }

    // 3. Fallback to SMTP
    const smtpHost = dbConfig.smtpHost || process.env.SMTP_HOST || "smtp-relay.brevo.com";
    const smtpPort = dbConfig.smtpPort || process.env.SMTP_PORT || 587;
    const smtpUser = dbConfig.smtpUser || process.env.SMTP_USER || "bivaaxtrader@gmail.com";
    const smtpPass = dbConfig.smtpPass || process.env.SMTP_PASS || "xsmtpsib-cb40d4386d54bad7f591fab86f4399e1bbddfadb556eb614d7a425d1006568b6-QpwLzh4XotgcuyYY";

    const config = {
      smtpHost,
      smtpPort,
      smtpUser,
      smtpPass,
      smtpFromEmail,
      smtpFromName
    };
    
    if (!config.smtpHost || !config.smtpPort || !config.smtpUser || !config.smtpPass) {
      logger.warn('SMTP configuration is missing. Cannot send email to ' + to);
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
      html,
      text: text || html.replace(/<[^>]*>?/gm, '').replace(/\s+/g, ' ').trim(),
      headers: {
        'X-Priority': '1 (Highest)',
        'X-MSMail-Priority': 'High',
        'X-Mailer': 'Bivaax Engine',
        'Feedback-ID': 'bivaax-trade:otp:reset'
      }
    });

    logger.info(`Email sent via SMTP: ${info.messageId}`);
    return true;
  } catch (error) {
    logger.error('Error sending email:', error);
    return false;
  }
}
