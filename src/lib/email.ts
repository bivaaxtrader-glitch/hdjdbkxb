import nodemailer from 'nodemailer';
import { adminDb } from './firebase-admin.ts';
import logger from './logger.ts';

export async function sendEmail(to: string, subject: string, html: string, text?: string) {
  try {
    // 1. Fetch settings from Firestore FIRST (user-controlled)
    const settingsDoc = await adminDb.collection('app_config').doc('settings').get();
    const dbConfig = settingsDoc.data() || {};

    // 2. Fallback to process.env if Firestore is missing critical SMTP info
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
      connectionTimeout: 10000, // 10 seconds
      greetingTimeout: 10000,   // 10 seconds
      socketTimeout: 30000,     // 30 seconds
      // MailDNS sometimes needs this for verification
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
      text: text || html.replace(/<[^>]*>?/gm, ''), // Basic fallback if text not provided
      headers: {
        'List-Unsubscribe': `<mailto:support@bivaax.com?subject=unsubscribe>`,
        'X-Entity-Ref-ID': Date.now().toString(),
        'X-Mailer': 'Bivaax Mailer',
        'Importance': 'high'
      }
    });

    logger.info(`Email sent: ${info.messageId}`);
    return true;
  } catch (error) {
    logger.error('Error sending email:', error);
    return false;
  }
}
