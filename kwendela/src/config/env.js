'use strict';

const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';
const isDevelopment = nodeEnv === 'development';
const isTest = nodeEnv === 'test';

function parseBoolean(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }
  return String(value).trim().toLowerCase() === 'true';
}

function parseNumber(value, defaultValue) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function parseList(value, defaultList = []) {
  if (!value || typeof value !== 'string') {
    return defaultList;
  }
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

const requiredInProduction = [
  'DATABASE_URL',
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
  'COOKIE_SECRET'
];

if (isProduction) {
  const missing = requiredInProduction.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `Variáveis de ambiente obrigatórias em falta para produção: ${missing.join(', ')}`
    );
  }
}

const uploadMaxSizeMb = parseNumber(process.env.UPLOAD_MAX_SIZE_MB, 10);

const env = Object.freeze({
  nodeEnv,
  isProduction,
  isDevelopment,
  isTest,
  port: parseNumber(process.env.PORT, 3000),
  appName: process.env.APP_NAME || 'KWENDELA',
  appUrl: process.env.APP_URL || 'http://localhost:3000',

  db: Object.freeze({
    url: isTest
      ? (process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || '')
      : (process.env.DATABASE_URL || ''),
    testUrl: process.env.TEST_DATABASE_URL || '',
    ssl: parseBoolean(process.env.DATABASE_SSL, isProduction),
    poolMax: parseNumber(process.env.DATABASE_POOL_MAX, 20)
  }),

  jwt: Object.freeze({
    accessSecret:
      process.env.JWT_ACCESS_SECRET ||
      (isProduction ? '' : 'kwendela_dev_access_secret_alterar_em_producao_64chars_minimo'),
    refreshSecret:
      process.env.JWT_REFRESH_SECRET ||
      (isProduction ? '' : 'kwendela_dev_refresh_secret_alterar_em_producao_64chars_minimo'),
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d'
  }),

  bcrypt: Object.freeze({
    saltRounds: parseNumber(process.env.BCRYPT_SALT_ROUNDS, isTest ? 4 : 12)
  }),

  cookie: Object.freeze({
    secret:
      process.env.COOKIE_SECRET ||
      (isProduction ? '' : 'kwendela_dev_cookie_secret_alterar_em_producao_32chars'),
    secure: parseBoolean(process.env.COOKIE_SECURE, isProduction)
  }),

  cors: Object.freeze({
    origins: parseList(
      process.env.CORS_ORIGINS,
      ['http://localhost:3000', 'https://kwendela.onrender.com']
    )
  }),

  superadmin: Object.freeze({
    name: process.env.SUPERADMIN_NAME || 'Super Administrador KWENDELA',
    email: process.env.SUPERADMIN_EMAIL || '',
    password: process.env.SUPERADMIN_PASSWORD || ''
  }),

  smtp: Object.freeze({
    host: process.env.SMTP_HOST || '',
    port: parseNumber(process.env.SMTP_PORT, 587),
    secure: parseBoolean(process.env.SMTP_SECURE, false),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.MAIL_FROM || 'KWENDELA <noreply@kwendela.ao>'
  }),

  maps: Object.freeze({
    provider: (process.env.MAPS_PROVIDER || 'mapbox').toLowerCase(),
    mapboxToken: process.env.MAPBOX_ACCESS_TOKEN || '',
    googleApiKey: process.env.GOOGLE_MAPS_API_KEY || ''
  }),

  upload: Object.freeze({
    maxSizeMb: uploadMaxSizeMb,
    maxSizeBytes: uploadMaxSizeMb * 1024 * 1024,
    dir: path.resolve(process.cwd(), process.env.UPLOAD_DIR || 'public/uploads')
  }),

  wallet: Object.freeze({
    demoMode: parseBoolean(process.env.WALLET_DEMO_MODE, true),
    commissionPercent: parseNumber(process.env.PLATFORM_COMMISSION_PERCENT, 10)
  }),

  waitlist: Object.freeze({
    confirmationMinutes: parseNumber(process.env.WAITLIST_CONFIRMATION_MINUTES, 30)
  }),

  logLevel: process.env.LOG_LEVEL || (isTest ? 'error' : 'info')
});

module.exports = env;