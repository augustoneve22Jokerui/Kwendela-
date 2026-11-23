'use strict';

const ApiError = require('../utils/ApiError');

const ROLES = Object.freeze({
  SUPERADMIN: 'superadmin',
  TOURIST: 'tourist',
  COMPANY_OWNER: 'company_owner',
  COMPANY_ADMIN: 'company_admin',
  COMPANY_STAFF: 'company_staff',
  GUIDE: 'guide'
});

const COMPANY_ROLES = [
  ROLES.COMPANY_OWNER,
  ROLES.COMPANY_ADMIN,
  ROLES.COMPANY_STAFF,
  ROLES.GUIDE
];

function requireRoles(...allowedRoles) {
  const normalized = allowedRoles.flat();

  return function rbacMiddleware(req, _res, next) {
    if (!req.user) {
      return next(ApiError.unauthorized('Autenticação obrigatória.', 'AUTH_REQUIRED'));
    }

    if (!normalized.includes(req.user.role)) {
      return next(
        ApiError.forbidden(
          'Não tem permissão para executar esta ação com o seu perfil atual.',
          'RBAC_FORBIDDEN'
        )
      );
    }

    return next();
  };
}

const requireSuperadmin = requireRoles(ROLES.SUPERADMIN);

const requireCompanyPortalUser = requireRoles(
  ROLES.SUPERADMIN,
  ...COMPANY_ROLES
);

function requireSelfOrSuperadmin(paramName = 'id') {
  return function selfOrSuperadminMiddleware(req, _res, next) {
    if (!req.user) {
      return next(ApiError.unauthorized('Autenticação obrigatória.', 'AUTH_REQUIRED'));
    }

    if (req.user.role === ROLES.SUPERADMIN) {
      return next();
    }

    const targetId = req.params && req.params[paramName];
    if (!targetId || String(targetId) !== String(req.user.id)) {
      return next(
        ApiError.forbidden(
          'Acesso negado ao recurso de outro utilizador.',
          'IDOR_FORBIDDEN'
        )
      );
    }

    return next();
  };
}

module.exports = {
  ROLES,
  COMPANY_ROLES,
  requireRoles,
  requireSuperadmin,
  requireCompanyPortalUser,
  requireSelfOrSuperadmin
};