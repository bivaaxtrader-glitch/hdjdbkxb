import nodemailer from 'nodemailer';
import { BrevoClient } from '@getbrevo/brevo';
import { adminDb } from './firebase-admin.ts';
import logger from './logger.ts';

export async function sendEmail(to: string, subject: string, html: string, text?: string) {
  try {
    // 1. Fetch settings from Firestore FIRST (user-controlled)
    const settingsDoc = await adminDb.collection('app_config').doc('settings').get();
    const dbConfig = settingsDoc.data() || {};

    // Check for Brevo API Key
    const brevoApiKey = dbConfig.brevoApiKey || process.env.BREVO_API_KEY || 'AQ.Ab8RN6JSAhga-vB62NB1E0hsOCV2rTV1wBP5dvHp92SmjdZMcQ';

    if (brevoApiKey) {
      const isBrevoV3Key = brevoApiKey.startsWith('xkeysib-');
      logger.info(`Email attempt to ${to} using key prefix: ${brevoApiKey.substring(0, 10)}... (Type: ${isBrevoV3Key ? 'V3 API' : 'Other/SMTP'})`);

      if (isBrevoV3Key) {
        const client = new BrevoClient({ apiKey: brevoApiKey });
        const response = await client.transactionalEmails.sendTransacEmail({
          subject,
          htmlContent: html,
          sender: { 
            name: dbConfig.smtpFromName || process.env.SMTP_FROM_NAME || 'Bivaax Trade', 
            email: dbConfig.smtpFromEmail || process.env.SMTP_FROM_EMAIL || 'no-reply@bivaax.trade' 
          },
          to: [{ email: to }]
        });

        logger.info(`Email sent via Brevo API: ${response.messageId}`);
        return true;
      } else {
        // If it's not a V3 key, it might be an SMTP password. 
        // We only use Brevo defaults if no host is specified in the database.
        if (!dbConfig.smtpHost) {
          dbConfig.smtpHost = 'smtp-relay.brevo.com';
          dbConfig.smtpPort = 587;
          // Brevo SMTP Username MUST be the account email address for authentication.
          dbConfig.smtpUser = dbConfig.smtpUser || 'bivaaxtrader@gmail.com';
          logger.info(`No SMTP host found, using Brevo defaults with user: ${dbConfig.smtpUser}`);
        }
        dbConfig.smtpPass = dbConfig.smtpPass || brevoApiKey;
      }
    }

    // 2. Fallback to Nodemailer SMTP
    const smtpHost = dbConfig.smtpHost || process.env.SMTP_HOST;
    const smtpPort = dbConfig.smtpPort || process.env.SMTP_PORT;
    const smtpUser = dbConfig.smtpUser || process.env.SMTP_USER;
    const smtpPass = dbConfig.smtpPass || process.env.SMTP_PASS;

    const smtpFromEmail = dbConfig.smtpFromEmail || process.env.SMTP_FROM_EMAIL;
    const smtpFromName = dbConfig.smtpFromName || process.env.SMTP_FROM_NAME;

    const config = {
      smtpHost,
      smtpPort,
      smtpUser,
      smtpPass,
      smtpFromEmail,
      smtpFromName
    };
    
    if (!config.smtpHost || !config.smtpPort || !config.smtpUser || !config.smtpPass) {
      logger.warn('Email configuration (Brevo API or SMTP) is missing. Cannot send email to ' + to);
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
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 30000,
      tls: {
        rejectUnauthorized: false
      }
    });

    const fromAddress = config.smtpFromEmail 
      ? `"${config.smtpFromName || 'Bivaax Trade'}" <${config.smtpFromEmail}>`
      : `"${config.smtpFromName || 'Bivaax Trade'}" <${config.smtpUser}>`;

    const info = await transporter.sendMail({
      from: fromAddress,
      to,
      subject,
      html,
      text: text || html.replace(/<[^>]*>?/gm, ''),
      headers: {
        'List-Unsubscribe': `<mailto:support@bivaax.com?subject=unsubscribe>`,
        'X-Entity-Ref-ID': Date.now().toString(),
        'X-Mailer': 'Bivaax Mailer',
        'Importance': 'high'
      }
    });

    logger.info(`Email sent via SMTP: ${info.messageId}`);
    return true;
  } catch (error: any) {
    logger.error('Error sending email:', {
      message: error.message,
      body: error.response?.body,
      stack: error.stack,
      to
    });
    return false;
  }
}
