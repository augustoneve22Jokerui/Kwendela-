'use strict';

const { query } = require('../config/database');
const logger = require('../config/logger');

const REDACTED_FIELDS = new Set([
  'password',
  'currentPassword',
  'newPassword',
  'confirmPassword',
  'token',
  'refreshToken',
  'accessToken',
  'secret'
]);

function sanitizeAuditMetadata(obj) {
  if (!obj || typeof obj !== 'object') {
    return {};
  }
  if (Array.isArray(obj)) {
    return obj.map(sanitizeAuditMetadata);
  }

  const clean = {};
  for (const [key, value] of Object.entries(obj)) {
    if (REDACTED_FIELDS.has(key)) {
      clean[key] = '[REDACTED]';
    } else if (value && typeof value === 'object') {
      clean[key] = sanitizeAuditMetadata(value);
    } else {
      clean[key] = value;
    }
  }
  return clean;
}

async function recordAuditLog({
  actorUserId = null,
  companyId = null,
  action,
  entityType = null,
  entityId = null,
  ipAddress = null,
  userAgent = null,
  metadata = {}
}) {
  try {
    await query(
      `
      INSERT INTO audit_logs (
        actor_user_id,
        company_id,
        action,
        entity_type,
        entity_id,
        ip_address,
        user_agent,
        metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
      `,
      [
        actorUserId,
        companyId,
        action,
        entityType,
        entityId ? String(entityId) : null,
        ipAddress,
        userAgent ? String(userAgent).slice(0, 500) : null,
        JSON.stringify(sanitizeAuditMetadata(metadata))
      ]
    );
  } catch (err) {
    logger.error('Falha ao gravar registo de auditoria', {
      action,
      entityType,
      message: err.message
    });
  }
}

function auditAction(action, entityType = null, entityIdResolver = null) {
  return function auditMiddleware(req, res, next) {
    res.on('finish', () => {
      if (res.statusCode >= 200 && res.statusCode < 400) {
        const resolvedEntityId =
          typeof entityIdResolver === 'function'
            ? entityIdResolver(req, res)
            : (req.params && req.params.id) || (res.locals && res.locals.auditEntityId) || null;

        const resolvedCompanyId =
          (req.company && req.company.id) ||
          (req.user && req.user.companyId) ||
          (req.params && req.params.companyId) ||
          null;

        recordAuditLog({
          actorUserId: req.user ? req.user.id : null,
          companyId: resolvedCompanyId,
          action,
          entityType,
          entityId: resolvedEntityId,
          ipAddress: req.ip || (req.connection && req.connection.remoteAddress) || null,
          userAgent: req.get('user-agent') || null,
          metadata: {
            method: req.method,
            path: req.originalUrl,
            statusCode: res.statusCode,
            params: req.params || {},
            bodyKeys: req.body && typeof req.body === 'object' ? Object.keys(req.body) : []
          }
        });
      }
    });

    next();
  };
}

module.exports = {
  recordAuditLog,
  auditAction,
  sanitizeAuditMetadata
};