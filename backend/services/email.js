/**
 * Provider-agnostic email sender using nodemailer over SMTP.
 *
 * Configure via env:
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE (true|false)
 *   EMAIL_FROM        — from address ("no-reply@labb.net")
 *   EMAIL_FROM_NAME   — friendly name ("Labb Pricing")
 *   APP_URL           — base URL for links in emails (e.g. https://price-app-web.onrender.com)
 *
 * If SMTP_HOST isn't set, outgoing mail is logged to the console instead
 * of sent — useful for local dev and for earlier stages on Render where
 * you haven't yet wired a provider. Callers treat send as fire-and-forget:
 * errors are logged but never propagate, because the invite / contract
 * record is the source of truth — staff can always copy the link.
 *
 * Works with SendGrid (smtp.sendgrid.net, user=apikey, pass=<api key>),
 * Postmark (smtp.postmarkapp.com), Resend (smtp.resend.com, user=resend),
 * AWS SES SMTP, Gmail, etc.
 */
const nodemailer = require('nodemailer');

const FROM = process.env.EMAIL_FROM || 'no-reply@labb.net';
const FROM_NAME = process.env.EMAIL_FROM_NAME || 'Labb Pricing';
const APP_URL = process.env.APP_URL || '';

let transporter = null;
let mode = 'console';

function init() {
  if (transporter !== null) return;

  if (process.env.SMTP_HOST) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    });
    mode = 'smtp';
  } else {
    transporter = { sendMail: async (msg) => ({ console: true, ...msg }) };
    mode = 'console';
    console.warn('[email] SMTP_HOST not set — emails will be logged, not delivered.');
  }
}

async function sendEmail({ to, subject, text, html, attachments }) {
  init();
  const from = `"${FROM_NAME}" <${FROM}>`;
  const msg = { from, to, subject, text, html };
  if (attachments) msg.attachments = attachments;

  try {
    if (mode === 'console') {
      console.log('[email:console] ----- OUTGOING EMAIL -----');
      console.log(`from: ${from}`);
      console.log(`to:   ${to}`);
      console.log(`subj: ${subject}`);
      console.log('---');
      console.log(text || (html && html.replace(/<[^>]+>/g, '')));
      console.log('[email:console] --------------------------');
      return { sent: false, logged: true };
    }
    const info = await transporter.sendMail(msg);
    return { sent: true, messageId: info.messageId };
  } catch (err) {
    console.error('[email] send failed:', { to, subject, err: err.message });
    return { sent: false, error: err.message };
  }
}

function appUrl(path) {
  const base = APP_URL.replace(/\/$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return base ? `${base}${p}` : p;
}

module.exports = { sendEmail, appUrl, FROM, FROM_NAME };
