const fs = require('fs');
const path = require('path');
const { Resend } = require('resend');

const EMAIL_FROM = process.env.EMAIL_FROM || 'noreply@elevatex.in';

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const sendEmail = async ({ to, subject, text, html, attachments }) => {
  if (!resend) {
    console.error('[EmailService] RESEND_API_KEY is not configured.');
    return false;
  }

  try {
    const emailData = {
      from: EMAIL_FROM,
      to,
      subject,
      text,
      html,
    };

    if (attachments && attachments.length > 0) {
      emailData.attachments = attachments.map((attachment) => ({
        filename: attachment.filename,
        path: attachment.path,
      }));
    }

    const { data, error } = await resend.emails.send(emailData);

    if (error) {
      console.error('[EmailService] Resend send failed:', error);
      return false;
    }

    console.log('[EmailService] Email sent:', data?.id);
    return Boolean(data?.id);
  } catch (error) {
    console.error('[EmailService] Resend error:', error);
    return false;
  }
};

const getParticipantEmails = (registration) => {
  return registration.email ? [registration.email] : [];
};

const buildAttachment = (registration) => {
  const screenshot = registration.paymentScreenshot;
  const filePath = screenshot && screenshot.path ? screenshot.path : null;

  if (!filePath || !fs.existsSync(filePath)) {
    return null;
  }

  return {
    filename: screenshot.originalName || path.basename(filePath),
    path: filePath,
    contentType: screenshot.mimeType || 'application/octet-stream',
  };
};

const sendVerificationEmail = async (registration) => {
  const recipients = getParticipantEmails(registration);
  if (recipients.length === 0) {
    return false;
  }

  const subject = `Verification Successful — ${registration.name}`;
  const text = [
    `Hello ${registration.name},`,
    '',
    "We're happy to let you know that your registration for ElevateX — the Freshers Program has been successfully verified! 🎉",
    '',
    "Your registration is now confirmed, and we're excited to have you join us for a day filled with fun, interaction, new connections, and memorable experiences.",
    '',
    'What to Expect',
    '',
    '🎤 Alumni Talk',
    'Hear stories, experiences, and advice from alumni and seniors.',
    '',
    '🎮 Fun & Games',
    'Break the ice, meet your batchmates, and take part in exciting activities.',
    '',
    '🎸 Jamming Session',
    'Unwind, enjoy the music, and share the vibe with everyone.',
    '',
    "Your registration is complete. All that's left is to show up, bring your energy, and enjoy the experience!",
    '',
    'Event: ElevateX',
    'Program: Freshers / Ice-Breaking Program',
    'Registration Status: Verified ✅',
    '',
    'We look forward to welcoming you to ElevateX and making your first college memories even more special.',
    '',
    'See you there! 🚀',
    '',
    'FISAT Horizon Club',
    'ElevateX Team',
  ].join('\n');

  const sent = await sendEmail({
    to: recipients,
    subject,
    text,
    html: `
      <p>Hello ${registration.name},</p>
      <p>We're happy to let you know that your registration for <strong>ElevateX — the Freshers Program</strong> has been successfully verified! 🎉</p>
      <p>Your registration is now confirmed, and we're excited to have you join us for a day filled with fun, interaction, new connections, and memorable experiences.</p>
      <p><strong>What to Expect</strong></p>
      <p>🎤 <strong>Alumni Talk</strong><br />Hear stories, experiences, and advice from alumni and seniors.</p>
      <p>🎮 <strong>Fun &amp; Games</strong><br />Break the ice, meet your batchmates, and take part in exciting activities.</p>
      <p>🎸 <strong>Jamming Session</strong><br />Unwind, enjoy the music, and share the vibe with everyone.</p>
      <p>Your registration is complete. All that's left is to show up, bring your energy, and enjoy the experience!</p>
      <p>
        Event: <strong>ElevateX</strong><br />
        Program: <strong>Freshers / Ice-Breaking Program</strong><br />
        Registration Status: <strong>Verified ✅</strong>
      </p>
      <p>We look forward to welcoming you to ElevateX and making your first college memories even more special.</p>
      <p>See you there! 🚀</p>
      <p>FISAT Horizon Club<br />ElevateX Team</p>
    `,
  });

  return sent;
};

const sendRejectionEmail = async (registration) => {
  const recipients = getParticipantEmails(registration);
  if (recipients.length === 0) {
    return false;
  }

  const subject = `Registration Update — ${registration.name}`;
  const attachment = buildAttachment(registration);

  const text = [
    `Hello ${registration.name},`,
    '',
    'Thank you for registering for ElevateX — the Freshers Program.',
    '',
    'During verification, we found an issue with the data/payment details you submitted, and unfortunately your registration could not be confirmed at this time.',
    '',
    'Reason for Rejection',
    `${registration.rejectionReason || 'Not provided'}`,
    '',
    'Your uploaded payment screenshot is attached to this email for your reference.',
    '',
    "If you'd like to resolve this and complete your registration, please get in touch with us as soon as possible.",
    '',
    'Event: ElevateX',
    'Program: Freshers / Ice-Breaking Program',
    'Registration Status: Rejected ❌',
    '',
    'We hope to get this sorted out with you soon so you can join us at ElevateX!',
    '',
    'FISAT Horizon Club',
    'ElevateX Team',
  ].join('\n');

  const sent = await sendEmail({
    to: recipients,
    subject,
    text,
    html: `
      <p>Hello ${registration.name},</p>
      <p>Thank you for registering for <strong>ElevateX — the Freshers Program</strong>.</p>
      <p>During verification, we found an issue with the data/payment details you submitted, and unfortunately your registration could not be confirmed at this time.</p>
      <p><strong>Reason for Rejection</strong><br />${registration.rejectionReason || 'Not provided'}</p>
      <p>Your uploaded payment screenshot is attached to this email for your reference.</p>
      <p>If you'd like to resolve this and complete your registration, please get in touch with us as soon as possible.</p>
      <p>
        Event: <strong>ElevateX</strong><br />
        Program: <strong>Freshers / Ice-Breaking Program</strong><br />
        Registration Status: <strong>Rejected ❌</strong>
      </p>
      <p>We hope to get this sorted out with you soon so you can join us at ElevateX!</p>
      <p>FISAT Horizon Club<br />ElevateX Team</p>
    `,
    attachments: attachment ? [attachment] : undefined,
  });

  return sent;
};

module.exports = {
  sendVerificationEmail,
  sendRejectionEmail,
};
