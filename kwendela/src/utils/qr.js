'use strict';

const crypto = require('crypto');
const QRCode = require('qrcode');
const env = require('../config/env');

function buildSigningString(payload) {
  return [
    payload.v || 1,
    payload.type || 'kwendela_pay',
    payload.token || '',
    payload.accountCode || '',
    payload.amount !== undefined && payload.amount !== null ? String(payload.amount) : '',
    payload.currency || 'AOA',
    payload.expiresAt || ''
  ].join('|');
}

function signQrPayload(payload) {
  const secret = env.cookie.secret || env.jwt.accessSecret;
  const canonical = buildSigningString(payload);
  return crypto.createHmac('sha256', secret).update(canonical).digest('hex');
}

function createSignedQrPayload({
  token,
  accountCode,
  amount = null,
  currency = 'AOA',
  description = '',
  expiresAt = null
}) {
  const basePayload = {
    v: 1,
    type: 'kwendela_pay',
    token,
    accountCode,
    amount: amount !== null && amount !== undefined ? Number(amount) : null,
    currency,
    description: description ? String(description).slice(0, 140) : '',
    expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null
  };

  return {
    ...basePayload,
    sig: signQrPayload(basePayload)
  };
}

function verifyQrPayloadSignature(payload) {
  if (!payload || typeof payload !== 'object' || !payload.sig) {
    return false;
  }

  const expectedSig = signQrPayload(payload);
  const actualBuf = Buffer.from(String(payload.sig), 'utf8');
  const expectedBuf = Buffer.from(expectedSig, 'utf8');

  if (actualBuf.length !== expectedBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(actualBuf, expectedBuf);
}

async function generateQrDataUrl(data, options = {}) {
  const serialized = typeof data === 'string' ? data : JSON.stringify(data);
  return QRCode.toDataURL(serialized, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: options.width || 280,
    color: {
      dark: '#10375C',
      light: '#FFFFFF'
    }
  });
}

async function generateQrSvg(data) {
  const serialized = typeof data === 'string' ? data : JSON.stringify(data);
  return QRCode.toString(serialized, {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 2,
    color: {
      dark: '#10375C',
      light: '#FFFFFF'
    }
  });
}

module.exports = {
  createSignedQrPayload,
  verifyQrPayloadSignature,
  generateQrDataUrl,
  generateQrSvg
};