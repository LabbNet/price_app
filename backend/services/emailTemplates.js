/**
 * Plain-text + HTML bodies for the transactional emails we send.
 * Keep these minimal — they just need to carry a link + short context.
 */
const { appUrl, FROM_NAME } = require('./email');

const ROLE_LABEL = {
  admin: 'Labb admin',
  sales: 'Labb sales',
  legal: 'Labb legal',
  finance: 'Labb finance',
  clinic_admin: 'clinic administrator',
  clinic_user: 'clinic user',
  client_user: 'client portal user',
};

function wrap(content) {
  return `<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,sans-serif;background:#f3f5f9;margin:0;padding:24px;color:#1a1f2b;"><div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:24px 28px;border:1px solid #e3e7ef;">${content}<hr style="border:0;border-top:1px solid #e3e7ef;margin:24px 0"><p style="color:#8b94a7;font-size:12px;margin:0">${FROM_NAME} — sent automatically, please do not reply.</p></div></body></html>`;
}

function button(href, label) {
  return `<p style="margin:20px 0"><a href="${href}" style="display:inline-block;background:#4f8cff;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">${label}</a></p>`;
}

// ----- Invite --------------------------------------------------------------

function inviteEmail({ invite, invitedByEmail, scopeLabel }) {
  const link = appUrl(`/accept-invite/${invite.token}`);
  const roleText = ROLE_LABEL[invite.role] || invite.role;
  const subject = `You're invited to the Labb Pricing portal`;

  const text = [
    `You've been invited to the ${FROM_NAME} portal${scopeLabel ? ` for ${scopeLabel}` : ''}.`,
    '',
    `Role: ${roleText}`,
    `Invited by: ${invitedByEmail}`,
    '',
    'Click the link below to set your password and access your account.',
    'The link expires on ' + new Date(invite.expires_at).toLocaleDateString() + '.',
    '',
    link,
  ].join('\n');

  const html = wrap(`
    <h1 style="margin:0 0 8px;font-size:20px">Welcome to Labb Pricing</h1>
    <p>You've been invited${scopeLabel ? ` to <strong>${scopeLabel}</strong>` : ''} as a <strong>${roleText}</strong>.</p>
    <p>Click below to set your password and log in. This link expires on <strong>${new Date(invite.expires_at).toLocaleDateString()}</strong>.</p>
    ${button(link, 'Set up your account')}
    <p style="color:#8b94a7;font-size:12px">If the button doesn't work, paste this into your browser:<br><span style="word-break:break-all">${link}</span></p>
  `);

  return { subject, text, html };
}

// ----- Contract signing link ----------------------------------------------

function contractSignEmail({ contract, client, clinic, token }) {
  const link = appUrl(`/sign/${token}`);
  const subject = `Please review and sign your ${FROM_NAME} agreement`;

  const text = [
    `Your contract from ${FROM_NAME} is ready to review and sign.`,
    '',
    `Client: ${client?.name || ''}`,
    `Clinic: ${clinic?.name || ''}`,
    '',
    'Open the link below to read the agreement and sign. After you sign, Labb will counter-sign and send a final copy.',
    '',
    link,
  ].join('\n');

  const html = wrap(`
    <h1 style="margin:0 0 8px;font-size:20px">Contract ready to sign</h1>
    <p>Your ${FROM_NAME} agreement${client?.name ? ` for <strong>${client.name}</strong>` : ''} is ready to review and sign.</p>
    <p>Click below to read the agreement and provide your signature. After you sign, Labb counter-signs and emails you a final copy.</p>
    ${button(link, 'Review and sign')}
    <p style="color:#8b94a7;font-size:12px">If the button doesn't work, paste this into your browser:<br><span style="word-break:break-all">${link}</span></p>
  `);

  return { subject, text, html };
}

// ----- Contract activated (after counter-sign) ----------------------------

function contractActivatedEmail({ contract, client }) {
  const subject = `Your ${FROM_NAME} agreement is active`;
  const portalLink = appUrl('/portal');

  const text = [
    `Good news — your agreement has been counter-signed and is now active.`,
    '',
    client?.name ? `Client: ${client.name}` : '',
    '',
    `A copy of the signed PDF is attached or available in your portal:`,
    portalLink,
  ].filter(Boolean).join('\n');

  const html = wrap(`
    <h1 style="margin:0 0 8px;font-size:20px">Your agreement is active</h1>
    <p>${client?.name ? `Your agreement for <strong>${client.name}</strong>` : 'Your agreement'} has been counter-signed by Labb and is now in effect.</p>
    <p>A copy of the signed PDF is attached. You can also download it from the portal:</p>
    ${button(portalLink, 'Open the portal')}
  `);

  return { subject, text, html };
}

module.exports = { inviteEmail, contractSignEmail, contractActivatedEmail };
