'use strict';

const ApiError = require('../utils/ApiError');
const { buildPaginationMeta } = require('../utils/pagination');
const { recordAuditLog } = require('../middlewares/audit.middleware');
const reportRepository = require('../repositories/report.repository');

const ALLOWED_TARGET_TYPES = new Set([
  'conversation',
  'company',
  'experience',
  'destination',
  'review',
  'user'
]);

async function createReport(payload, user, requestMeta = {}) {
  if (!ALLOWED_TARGET_TYPES.has(payload.targetType)) {
    throw ApiError.badRequest('Tipo de alvo de denúncia inválido.');
  }

  const report = await reportRepository.createReport({
    reporterUserId: user.id,
    targetType: payload.targetType,
    targetId: payload.targetId,
    reason: payload.reason,
    description: payload.description
  });

  await recordAuditLog({
    actorUserId: user.id,
    action: 'report.create',
    entityType: 'report',
    entityId: report.id,
    ipAddress: requestMeta.ip,
    userAgent: requestMeta.userAgent,
    metadata: {
      targetType: payload.targetType,
      targetId: payload.targetId,
      reason: payload.reason
    }
  });

  return report;
}

async function listMyReports(userId, pagination) {
  const { items, total } = await reportRepository.findByReporter(userId, pagination);
  return {
    items,
    pagination: buildPaginationMeta({
      page: pagination.page,
      limit: pagination.limit,
      total
    })
  };
}

module.exports = {
  createReport,
  listMyReports
};