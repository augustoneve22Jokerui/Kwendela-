'use strict';

const rateLimit = require('express-rate-limit');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');

function createLimiter({ windowMs, max, message, skipInTest = true }) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => skipInTest && env.isTest && process.env.ENABLE_TEST_RATE_LIMIT !== 'true',
    handler: (_req, _res, next) => {
      next(ApiError.tooManyRequests(message));
    }
  });
}

const generalApiLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: 'Demasiados pedidos efetuados a partir deste endereço IP. Tente novamente dentro de alguns minutos.'
});

const authLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Demasiadas tentativas de autenticação. Por segurança, aguarde 15 minutos antes de tentar novamente.'
});

const financialLimiter = createLimiter({
  windowMs: 60 * 1000,
  max: 30,
  message: 'Limite de operações financeiras por minuto atingido. Aguarde um momento.'
});

const uploadLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: 'Demasiados envios de ficheiros em pouco tempo. Tente novamente mais tarde.'
});

module.exports = {
  createLimiter,
  generalApiLimiter,
  authLimiter,
  financialLimiter,
  uploadLimiter
};