'use strict';

const winston = require('winston');
const env = require('./env');

const SENSITIVE_KEYS = new Set([
  'password',
  'passwordHash',
  'password_hash',
  'currentPassword',
  'newPassword',
  'token',
  'accessToken',
  'refreshToken',
  'authorization',
  'cookie',
  'secret',
  'DATABASE_URL'
]);

function redactSensitiveData(value) {
  if (value === null || value === undefined || typeof value !== 'object') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(redactSensitiveData);
  }

  const sanitized = {};
  for (const [key, val] of Object.entries(value)) {
    if (SENSITIVE_KEYS.has(key)) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof val === 'object' && val !== null) {
      sanitized[key] = redactSensitiveData(val);
    } else {
      sanitized[key] = val;
    }
  }
  return sanitized;
}

const redactFormat = winston.format((info) => {
  const { level, message, timestamp, stack, ...meta } = info;
  const sanitizedMeta = redactSensitiveData(meta);
  return {
    level,
    message,
    timestamp,
    ...(stack ? { stack } : {}),
    ...sanitizedMeta
  };
});

const developmentFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  redactFormat(),
  winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    const metaString = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    const stackString = stack ? `\n${stack}` : '';
    return `[${timestamp}] ${level}: ${message}${metaString}${stackString}`;
  })
);

const productionFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  redactFormat(),
  winston.format.json()
);

const logger = winston.createLogger({
  level: env.logLevel,
  defaultMeta: { service: env.appName.toLowerCase(), env: env.nodeEnv },
  format: env.isProduction ? productionFormat : developmentFormat,
  transports: [
    new winston.transports.Console({
      silent: env.isTest && !process.env.LOG_LEVEL
    })
  ],
  exitOnError: false
});

logger.stream = {
  write: (message) => {
    logger.info(message.trim(), { channel: 'http' });
  }
};

module.exports = logger;