'use strict';

const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const { generateRandomToken, timingSafeEqualHex } = require('../utils/crypto');

const CSRF_COOKIE_NAME = 'kwendela_csrf_token';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function getCookieOptions() {
  return {
    httpOnly: false,
    secure: env.cookie.secure,
    sameSite: 'lax',
    path: '/'
  };
}

function ensureCsrfToken(req, res) {
  let token = req.cookies && req.cookies[CSRF_COOKIE_NAME];
  if (!token || typeof token !== 'string' || token.length < 32) {
    token = generateRandomToken(32);
    res.cookie(CSRF_COOKIE_NAME, token, getCookieOptions());
  }
  res.locals.csrfToken = token;
  req.csrfToken = () => token;
  return token;
}

function csrfProtection(req, res, next) {
  const token = ensureCsrfToken(req, res);

  if (SAFE_METHODS.has(req.method)) {
    return next();
  }

  const authHeader = req.headers.authorization;
  if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    return next();
  }

  const hasAuthCookies = Boolean(
    req.cookies &&
      (req.cookies.kwendela_access_token || req.cookies.kwendela_refresh_token)
  );

  const isWebFormRequest =
    !req.originalUrl.startsWith('/api/') ||
    (req.is('application/x-www-form-urlencoded') || req.is('multipart/form-data'));

  if (!hasAuthCookies && !isWebFormRequest) {
    return next();
  }

  const submittedToken =
    req.headers['x-csrf-token'] ||
    req.headers['x-xsrf-token'] ||
    (req.body && req.body._csrf) ||
    (req.query && req.query._csrf);

  if (!submittedToken || !timingSafeEqualHex(String(submittedToken), String(token))) {
    return next(
      ApiError.forbidden(
        'Token de segurança CSRF inválido ou ausente. Recarregue a página e tente novamente.',
        'CSRF_TOKEN_INVALID'
      )
    );
  }

  return next();
}

module.exports = {
  CSRF_COOKIE_NAME,
  ensureCsrfToken,
  csrfProtection
};