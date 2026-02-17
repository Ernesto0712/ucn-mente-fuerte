const nodemailer = require('nodemailer');

function buildTransport() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass }
  });
}

async function sendMail({ to, subject, html, text }) {
  const transporter = buildTransport();
  if (!transporter) {
    const err = new Error('SMTP no configurado. Configura SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS en .env');
    err.code = 'SMTP_NOT_CONFIGURED';
    throw err;
  }

  const from = process.env.MAIL_FROM || process.env.SMTP_USER;
  return transporter.sendMail({ from, to, subject, html, text });
}

module.exports = { sendMail };
