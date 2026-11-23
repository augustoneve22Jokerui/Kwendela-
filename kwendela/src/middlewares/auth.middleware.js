'use strict';

const ApiError = require('../utils/ApiError');
const {
  extractAccessTokenFromRequest,
  verifyAccessToken
} = require('../utils/token');
const userRepository = require('../repositories/user.repository');
const notificationRepository = require('../repositories/notification.repository');

function isApiRequest(req) {
  if (!req) {
    return false;
  }

  const url = req.originalUrl || req.url || '';
  if (url.startsWith('/api/')) {
    return true;
  }

  if (req.xhr) {
    return true;
  }

  const accept = req.get('accept') || '';
  return accept.includes('application/json') && !accept.includes('text/html');
}

function buildRequestUser(user) {
  return {
    id: user.id,
    fullName: user.full_name,
    name: user.full_name,
    email: user.email,
    phone: user.phone || null,
    role: user.role,
    status: user.status,
    mustChangePassword: Boolean(user.must_change_password),
    isPremium: Boolean(user.is_premium),
    premiumExpiresAt: user.premium_expires_at || null,
    avatarUrl: user.avatar_url || null,
    companyId: user.company_id || null,
    companyRole: user.company_role || null,
    companyName: user.company_name || null,
    companyStatus: user.company_status || null
  };
}

async function attachUnreadCountIfWeb(req, res, userId) {
  if (req.method === 'GET' && !isApiRequest(req)) {
    try {
      res.locals.unreadNotificationsCount = await notificationRepository.countUnread(userId);
    } catch (_err) {
      res.locals.unreadNotificationsCount = 0;
    }
  }
}

function handleUnauthenticatedWeb(req, res, message = null) {
  res.clearCookie('kwendela_access_token', { path: '/' });
  res.clearCookie('kwendela_refresh_token', { path: '/' });

  if (message) {
    res.cookie('kwendela_flash', JSON.stringify({ error: message }), {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 1000
    });
  }

  const nextParam =
    req.originalUrl && req.originalUrl.startsWith('/') && !req.originalUrl.startsWith('/auth/')
      ? `?next=${encodeURIComponent(req.originalUrl)}`
      : '';

  return res.redirect(`/auth/login${nextParam}`);
}

function authenticate(options = {}) {
  const { allowMustChangePassword = false } = options;

  return async function authenticateMiddleware(req, res, next) {
    try {
      const token = extractAccessTokenFromRequest(req);
      if (!token) {
        if (isApiRequest(req)) {
          return next(ApiError.unauthorized('Autenticação obrigatória.', 'AUTH_REQUIRED'));
        }
        return handleUnauthenticatedWeb(req, res);
      }

      const decoded = verifyAccessToken(token);
      const dbUser = await userRepository.findAuthContextById(decoded.sub);

      if (!dbUser) {
        if (isApiRequest(req)) {
          return next(ApiError.unauthorized('Utilizador não encontrado.', 'USER_NOT_FOUND'));
        }
        return handleUnauthenticatedWeb(req, res, 'Sessão inválida. Inicie sessão novamente.');
      }

      if (dbUser.status === 'suspended') {
        if (isApiRequest(req)) {
          return next(ApiError.forbidden('Esta conta encontra-se suspensa.', 'ACCOUNT_SUSPENDED'));
        }
        return handleUnauthenticatedWeb(req, res, 'A sua conta encontra-se suspensa.');
      }

      if (dbUser.status !== 'active') {
        if (isApiRequest(req)) {
          return next(ApiError.forbidden('Conta inativa ou pendente de verificação.', 'ACCOUNT_INACTIVE'));
        }
        return handleUnauthenticatedWeb(req, res, 'Conta inativa ou pendente de verificação.');
      }

      const requestUser = buildRequestUser(dbUser);
      req.user = requestUser;
      res.locals.currentUser = requestUser;

      await attachUnreadCountIfWeb(req, res, requestUser.id);

      if (requestUser.mustChangePassword && !allowMustChangePassword) {
        if (isApiRequest(req)) {
          return next(
            ApiError.forbidden(
              'É obrigatório alterar a palavra-passe inicial antes de continuar.',
              'MUST_CHANGE_PASSWORD'
            )
          );
        }
        return res.redirect('/auth/force-change-password');
      }

      return next();
    } catch (err) {
      if (isApiRequest(req)) {
        return next(err);
      }
      return handleUnauthenticatedWeb(req, res, 'Sessão expirada. Inicie sessão novamente.');
    }
  };
}

async function optionalAuth(req, res, next) {
  try {
    const token = extractAccessTokenFromRequest(req);
    if (!token) {
      req.user = null;
      res.locals.currentUser = null;
      return next();
    }

    const decoded = verifyAccessToken(token);
    const dbUser = await userRepository.findAuthContextById(decoded.sub);

    if (!dbUser || dbUser.status !== 'active') {
      req.user = null;
      res.locals.currentUser = null;
      return next();
    }

    const requestUser = buildRequestUser(dbUser);
    req.user = requestUser;
    res.locals.currentUser = requestUser;

    await attachUnreadCountIfWeb(req, res, requestUser.id);
    return next();
  } catch (_err) {
    req.user = null;
    res.locals.currentUser = null;
    return next();
  }
}

module.exports = {
  isApiRequest,
  authenticate,
  optionalAuth
};
