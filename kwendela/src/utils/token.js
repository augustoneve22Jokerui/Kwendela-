'use strict';

const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const env = require('../config/env');
const ApiError = require('./ApiError');

const JWT_ISSUER = 'kwendela';
const JWT_AUDIENCE = 'kwendela-clients';

function parseDurationToMs(duration) {
  if (typeof duration === 'number' && Number.isFinite(duration)) {
    return duration * 1000;
  }

  const str = String(duration || '').trim();
  const match = /^(\d+)([smhd])$/i.exec(str);
  if (!match) {
    return 15 * 60 * 1000;
  }

  const value = Number(match[1]);
  const unit = match[2].toLowerCase();

  switch (unit) {
    case 's':
      return value * 1000;
    case 'm':
      return value * 60 * 1000;
    case 'h':
      return value * 60 * 60 * 1000;
    case 'd':
      return value * 24 * 60 * 60 * 1000;
    default:
      return 15 * 60 * 1000;
  }
}

function signAccessToken(payload) {
  const jti = uuidv4();
  const tokenPayload = {
    sub: payload.userId,
    role: payload.role,
    companyId: payload.companyId || null,
    companyRole: payload.companyRole || null,
    mustChangePassword: Boolean(payload.mustChangePassword),
    type: 'access',
    jti
  };

  const token = jwt.sign(tokenPayload, env.jwt.accessSecret, {
    expiresIn: env.jwt.accessExpiresIn,
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE
  });

  return {
    token,
    jti,
    expiresInMs: parseDurationToMs(env.jwt.accessExpiresIn)
  };
}

function signRefreshToken({ userId, familyId = null }) {
  const jti = uuidv4();
  const tokenFamilyId = familyId || uuidv4();

  const tokenPayload = {
    sub: userId,
    familyId: tokenFamilyId,
    type: 'refresh',
    jti
  };

  const token = jwt.sign(tokenPayload, env.jwt.refreshSecret, {
    expiresIn: env.jwt.refreshExpiresIn,
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE
  });

  const expiresInMs = parseDurationToMs(env.jwt.refreshExpiresIn);

  return {
    token,
    jti,
    familyId: tokenFamilyId,
    expiresInMs,
    expiresAt: new Date(Date.now() + expiresInMs)
  };
}

function verifyAccessToken(token) {
  try {
    const decoded = jwt.verify(token, env.jwt.accessSecret, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE
    });

    if (decoded.type !== 'access' || !decoded.sub) {
      throw ApiError.unauthorized('Token de acesso inválido.', 'INVALID_TOKEN');
    }

    return decoded;
  } catch (err) {
    if (err instanceof ApiError) {
      throw err;
    }
    if (err.name === 'TokenExpiredError') {
      throw ApiError.unauthorized('Sessão expirada. Atualize o token ou inicie sessão novamente.', 'TOKEN_EXPIRED');
    }
    throw ApiError.unauthorized('Token de acesso inválido.', 'INVALID_TOKEN');
  }
}

function verifyRefreshToken(token) {
  try {
    const decoded = jwt.verify(token, env.jwt.refreshSecret, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE
    });

    if (decoded.type !== 'refresh' || !decoded.sub || !decoded.jti) {
      throw ApiError.unauthorized('Refresh token inválido.', 'INVALID_REFRESH_TOKEN');
    }

    return decoded;
  } catch (err) {
    if (err instanceof ApiError) {
      throw err;
    }
    if (err.name === 'TokenExpiredError') {
      throw ApiError.unauthorized('Refresh token expirado. Inicie sessão novamente.', 'REFRESH_TOKEN_EXPIRED');
    }
    throw ApiError.unauthorized('Refresh token inválido.', 'INVALID_REFRESH_TOKEN');
  }
}

function extractAccessTokenFromRequest(req) {
  const authHeader = req.headers.authorization;
  if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    const bearer = authHeader.slice(7).trim();
    if (bearer) {
      return bearer;
    }
  }

  if (req.cookies && req.cookies.kwendela_access_token) {
    return req.cookies.kwendela_access_token;
  }

  return null;
}

function getAuthCookieOptions(maxAgeMs) {
  return {
    httpOnly: true,
    secure: env.cookie.secure,
    sameSite: 'lax',
    path: '/',
    maxAge: maxAgeMs
  };
}

module.exports = {
  parseDurationToMs,
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  extractAccessTokenFromRequest,
  getAuthCookieOptions
};