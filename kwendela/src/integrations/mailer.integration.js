'use strict';

const nodemailer = require('nodemailer');
const env = require('../config/env');
const logger = require('../config/logger');

let cachedTransporter = null;

function isSmtpConfigured() {
  return Boolean(
    env.smtp.host &&
      env.smtp.host !== 'smtp.example.com' &&
      !env.isTest
  );
}

function getTransporter() {
  if (cachedTransporter) {
    return cachedTransporter;
  }

  if (!isSmtpConfigured()) {
    cachedTransporter = nodemailer.createTransport({
      jsonTransport: true
    });
    return cachedTransporter;
  }

  const transportConfig = {
    host: env.smtp.host,
    port: env.smtp.port,
    secure: env.smtp.secure
  };

  if (env.smtp.user && env.smtp.pass) {
    transportConfig.auth = {
      user: env.smtp.user,
      pass: env.smtp.pass
    };
  }

  cachedTransporter = nodemailer.createTransport(transportConfig);
  return cachedTransporter;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function wrapEmailLayout({ title, bodyHtml }) {
  const safeTitle = escapeHtml(title);
  const appUrl = env.appUrl.replace(/\/$/, '');

  return `
<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${safeTitle}</title>
</head>
<body style="margin:0;padding:0;background-color:#FAF8F5;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1E2022;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#FAF8F5;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background-color:#FFFFFF;border-radius:12px;overflow:hidden;border:1px solid #EAE4DC;">
          <tr>
            <td style="background-color:#10375C;padding:24px 32px;">
              <span style="font-size:22px;font-weight:700;letter-spacing:2px;color:#FFFFFF;">KWENDELA</span>
              <span style="display:block;font-size:12px;color:#D95D39;margin-top:4px;letter-spacing:1px;">TURISMO, EXPEDIÇÕES &amp; EXPERIÊNCIAS</span>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <h1 style="margin:0 0 16px;font-size:20px;color:#10375C;">${safeTitle}</h1>
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="background-color:#FAF8F5;padding:20px 32px;border-top:1px solid #EAE4DC;font-size:12px;color:#666B70;">
              <p style="margin:0 0 6px;">Enviado automaticamente pela plataforma <a href="${escapeHtml(appUrl)}" style="color:#10375C;text-decoration:none;font-weight:600;">KWENDELA</a>.</p>
              <p style="margin:0;">Se não reconhece esta atividade, ignore este email ou contacte o suporte.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

async function sendEmail({ to, subject, html, text }) {
  if (!to) {
    return null;
  }

  const transporter = getTransporter();
  const info = await transporter.sendMail({
    from: env.smtp.from,
    to,
    subject,
    html,
    text
  });

  if (!isSmtpConfigured()) {
    logger.debug('Email processado em modo de transporte local/simulado', {
      to,
      subject,
      messageId: info.messageId
    });
  } else {
    logger.info('Email transacional enviado com sucesso', {
      to,
      subject,
      messageId: info.messageId
    });
  }

  return info;
}

async function sendWelcomeEmail(user) {
  const fullName = escapeHtml(user.full_name || user.fullName || 'Viajante');
  const appUrl = env.appUrl.replace(/\/$/, '');

  const bodyHtml = `
    <p style="margin:0 0 14px;line-height:1.6;">Olá, <strong>${fullName}</strong>.</p>
    <p style="margin:0 0 14px;line-height:1.6;">A sua conta na plataforma <strong>KWENDELA</strong> foi criada com sucesso. Já pode explorar destinos autênticos em Angola, reservar experiências e expedições, planear rotas e gerir a sua Carteira KWENDELA.</p>
    <p style="margin:24px 0;">
      <a href="${escapeHtml(appUrl)}/discover" style="display:inline-block;background-color:#D95D39;color:#FFFFFF;text-decoration:none;font-weight:600;padding:12px 24px;border-radius:8px;">Explorar Destinos</a>
    </p>
  `;

  return sendEmail({
    to: user.email,
    subject: 'Bem-vindo ao KWENDELA',
    html: wrapEmailLayout({
      title: 'Bem-vindo ao KWENDELA',
      bodyHtml
    }),
    text: `Olá ${user.full_name || user.fullName || 'Viajante'}, a sua conta KWENDELA foi criada com sucesso. Aceda em ${appUrl}/discover`
  });
}

async function sendPasswordResetEmail(user, rawToken) {
  const fullName = escapeHtml(user.full_name || user.fullName || 'Utilizador');
  const appUrl = env.appUrl.replace(/\/$/, '');
  const resetUrl = `${appUrl}/auth/reset-password?token=${encodeURIComponent(rawToken)}`;

  const bodyHtml = `
    <p style="margin:0 0 14px;line-height:1.6;">Olá, <strong>${fullName}</strong>.</p>
    <p style="margin:0 0 14px;line-height:1.6;">Recebemos um pedido para redefinir a palavra-passe da sua conta KWENDELA. Este link é válido durante <strong>60 minutos</strong>.</p>
    <p style="margin:24px 0;">
      <a href="${escapeHtml(resetUrl)}" style="display:inline-block;background-color:#10375C;color:#FFFFFF;text-decoration:none;font-weight:600;padding:12px 24px;border-radius:8px;">Redefinir Palavra-passe</a>
    </p>
    <p style="margin:0;font-size:13px;color:#555B61;line-height:1.5;">Se o botão não funcionar, copie e cole este endereço no seu navegador:<br /><span style="word-break:break-all;color:#10375C;">${escapeHtml(resetUrl)}</span></p>
  `;

  return sendEmail({
    to: user.email,
    subject: 'Recuperação de Palavra-passe — KWENDELA',
    html: wrapEmailLayout({
      title: 'Recuperação de Palavra-passe',
      bodyHtml
    }),
    text: `Olá ${user.full_name || user.fullName || ''}, redefina a sua palavra-passe KWENDELA através do link (válido por 60 minutos): ${resetUrl}`
  });
}

async function sendNotificationEmail(user, { title, message }) {
  const fullName = escapeHtml(user.full_name || user.fullName || 'Utilizador');

  const bodyHtml = `
    <p style="margin:0 0 14px;line-height:1.6;">Olá, <strong>${fullName}</strong>.</p>
    <p style="margin:0 0 14px;line-height:1.6;">${escapeHtml(message)}</p>
  `;

  return sendEmail({
    to: user.email,
    subject: `${title} — KWENDELA`,
    html: wrapEmailLayout({
      title,
      bodyHtml
    }),
    text: `${title}: ${message}`
  });
}

module.exports = {
  isSmtpConfigured,
  sendEmail,
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendNotificationEmail
};