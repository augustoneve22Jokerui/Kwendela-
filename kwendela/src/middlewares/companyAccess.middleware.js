'use strict';

const ApiError = require('../utils/ApiError');
const companyRepository = require('../repositories/company.repository');

function requireCompanyAccess(options = {}) {
  const {
    allowedCompanyRoles = [],
    allowSuperadmin = true,
    allowInactiveCompany = false
  } = options;

  return async function companyAccessMiddleware(req, res, next) {
    try {
      if (!req.user) {
        return next(ApiError.unauthorized('Autenticação obrigatória.', 'AUTH_REQUIRED'));
      }

      const requestedCompanyId =
        (req.params && req.params.companyId) ||
        (req.body && req.body.companyId) ||
        (req.query && req.query.companyId) ||
        req.user.companyId ||
        null;

      if (req.user.role === 'superadmin' && allowSuperadmin) {
        if (!requestedCompanyId) {
          return next(ApiError.badRequest('Identificador da empresa obrigatório.'));
        }
        const company = await companyRepository.findById(requestedCompanyId);
        if (!company) {
          return next(ApiError.notFound('Empresa não encontrada.'));
        }
        req.company = company;
        req.companyMembership = { role: 'superadmin_override', is_active: true };
        return next();
      }

      if (!requestedCompanyId) {
        return next(
          ApiError.forbidden(
            'Esta conta não está associada a nenhuma empresa de turismo.',
            'COMPANY_MEMBERSHIP_REQUIRED'
          )
        );
      }

      if (req.user.companyId && String(requestedCompanyId) !== String(req.user.companyId)) {
        return next(
          ApiError.forbidden(
            'Acesso negado: não tem autorização para aceder a dados de outra empresa.',
            'CROSS_COMPANY_ACCESS_DENIED'
          )
        );
      }

      const membership = await companyRepository.findMembership(requestedCompanyId, req.user.id);
      if (!membership || !membership.is_active) {
        return next(
          ApiError.forbidden(
            'Não possui associação ativa a esta empresa.',
            'COMPANY_MEMBERSHIP_INACTIVE'
          )
        );
      }

      const company = await companyRepository.findById(requestedCompanyId);
      if (!company) {
        return next(ApiError.notFound('Empresa não encontrada.'));
      }

      if (!allowInactiveCompany && company.status === 'suspended') {
        return next(
          ApiError.forbidden(
            'A conta desta empresa encontra-se suspensa. Contacte o suporte KWENDELA.',
            'COMPANY_SUSPENDED'
          )
        );
      }

      if (!allowInactiveCompany && company.status === 'rejected') {
        return next(
          ApiError.forbidden(
            'O registo desta empresa foi rejeitado.',
            'COMPANY_REJECTED'
          )
        );
      }

      if (
        Array.isArray(allowedCompanyRoles) &&
        allowedCompanyRoles.length > 0 &&
        !allowedCompanyRoles.includes(membership.role)
      ) {
        return next(
          ApiError.forbidden(
            'O seu cargo na empresa não permite executar esta operação.',
            'COMPANY_ROLE_FORBIDDEN'
          )
        );
      }

      req.company = company;
      req.companyMembership = membership;
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

module.exports = {
  requireCompanyAccess
};