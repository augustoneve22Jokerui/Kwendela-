'use strict';

const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/ApiResponse');
const { parsePagination } = require('../../utils/pagination');
const adminService = require('../../services/admin.service');

function extractRequestMeta(req) {
  return {
    ip: req.ip || (req.connection && req.connection.remoteAddress) || null,
    userAgent: req.get('user-agent') || null
  };
}

const getOverview = asyncHandler(async (_req, res) => {
  const overview = await adminService.getDashboardOverview();
  return ApiResponse.success(res, overview, 'Indicadores gerais obtidos com sucesso.');
});

const createCompanyAccount = asyncHandler(async (req, res) => {
  const result = await adminService.createCompanyAccount(
    req.body,
    req.user,
    extractRequestMeta(req)
  );
  return ApiResponse.created(
    res,
    result,
    'Conta empresarial criada com sucesso. A empresa deverá alterar a palavra-passe no primeiro login.'
  );
});

const listCompanies = asyncHandler(async (req, res) => {
  const pagination = parsePagination(req.query, { defaultLimit: 20 });
  const filters = {
    status: req.query.status,
    province: req.query.province,
    search: req.query.search
  };
  const result = await adminService.listCompanies(filters, pagination);
  return ApiResponse.paginated(res, result.items, result.pagination, 'Empresas listadas com sucesso.');
});

const getCompanyDetails = asyncHandler(async (req, res) => {
  const company = await adminService.getCompanyDetails(req.params.id);
  return ApiResponse.success(res, company, 'Detalhes da empresa obtidos com sucesso.');
});

const updateCompanyStatus = asyncHandler(async (req, res) => {
  const updated = await adminService.updateCompanyStatus(
    req.params.id,
    req.body,
    req.user,
    extractRequestMeta(req)
  );
  return ApiResponse.success(res, updated, 'Estado da empresa atualizado com sucesso.');
});

const assignCompanyPlan = asyncHandler(async (req, res) => {
  const subscription = await adminService.assignCompanyPlan(
    req.params.id,
    req.body,
    req.user,
    extractRequestMeta(req)
  );
  return ApiResponse.success(res, subscription, 'Plano atribuído à empresa com sucesso.');
});

const listPlans = asyncHandler(async (_req, res) => {
  const plans = await adminService.listPlans();
  return ApiResponse.success(res, plans, 'Planos configuráveis obtidos com sucesso.');
});

const updatePlan = asyncHandler(async (req, res) => {
  const updated = await adminService.updatePlan(
    req.params.id,
    req.body,
    req.user,
    extractRequestMeta(req)
  );
  return ApiResponse.success(res, updated, 'Plano atualizado com sucesso.');
});

const listSubscriptions = asyncHandler(async (req, res) => {
  const pagination = parsePagination(req.query, { defaultLimit: 20 });
  const filters = {
    status: req.query.status,
    companyId: req.query.companyId,
    planId: req.query.planId
  };
  const result = await adminService.listSubscriptions(filters, pagination);
  return ApiResponse.paginated(res, result.items, result.pagination, 'Assinaturas obtidas com sucesso.');
});

const listPayments = asyncHandler(async (req, res) => {
  const pagination = parsePagination(req.query, { defaultLimit: 20 });
  const filters = {
    type: req.query.type,
    status: req.query.status,
    isDemo: req.query.isDemo,
    search: req.query.search
  };
  const result = await adminService.listPayments(filters, pagination);
  return ApiResponse.paginated(res, result.items, result.pagination, 'Operações financeiras obtidas com sucesso.');
});

const listUsers = asyncHandler(async (req, res) => {
  const pagination = parsePagination(req.query, { defaultLimit: 20 });
  const filters = {
    role: req.query.role,
    status: req.query.status,
    search: req.query.search
  };
  const result = await adminService.listUsers(filters, pagination);
  return ApiResponse.paginated(res, result.items, result.pagination, 'Utilizadores obtidos com sucesso.');
});

const updateUserStatus = asyncHandler(async (req, res) => {
  const updated = await adminService.updateUserStatus(
    req.params.id,
    req.body,
    req.user,
    extractRequestMeta(req)
  );
  return ApiResponse.success(res, updated, 'Estado do utilizador atualizado com sucesso.');
});

const listDestinationsForModeration = asyncHandler(async (req, res) => {
  const pagination = parsePagination(req.query, { defaultLimit: 20 });
  const filters = {
    moderationStatus: req.query.moderationStatus,
    province: req.query.province,
    search: req.query.search
  };
  const result = await adminService.listDestinationsForModeration(filters, pagination);
  return ApiResponse.paginated(res, result.items, result.pagination, 'Destinos para moderação obtidos.');
});

const moderateDestination = asyncHandler(async (req, res) => {
  const updated = await adminService.moderateDestination(
    req.params.id,
    req.body,
    req.user,
    extractRequestMeta(req)
  );
  return ApiResponse.success(res, updated, 'Moderação de destino concluída com sucesso.');
});

const listExperiencesForModeration = asyncHandler(async (req, res) => {
  const pagination = parsePagination(req.query, { defaultLimit: 20 });
  const filters = {
    moderationStatus: req.query.moderationStatus,
    category: req.query.category,
    search: req.query.search
  };
  const result = await adminService.listExperiencesForModeration(filters, pagination);
  return ApiResponse.paginated(res, result.items, result.pagination, 'Experiências para moderação obtidas.');
});

const moderateExperience = asyncHandler(async (req, res) => {
  const updated = await adminService.moderateExperience(
    req.params.id,
    req.body,
    req.user,
    extractRequestMeta(req)
  );
  return ApiResponse.success(res, updated, 'Moderação de experiência concluída com sucesso.');
});

const listBookings = asyncHandler(async (req, res) => {
  const pagination = parsePagination(req.query, { defaultLimit: 20 });
  const filters = {
    status: req.query.status,
    companyId: req.query.companyId,
    search: req.query.search
  };
  const result = await adminService.listBookings(filters, pagination);
  return ApiResponse.paginated(res, result.items, result.pagination, 'Reservas globais obtidas com sucesso.');
});

const listReports = asyncHandler(async (req, res) => {
  const pagination = parsePagination(req.query, { defaultLimit: 20 });
  const filters = {
    status: req.query.status,
    targetType: req.query.targetType
  };
  const result = await adminService.listReports(filters, pagination);
  return ApiResponse.paginated(res, result.items, result.pagination, 'Denúncias obtidas com sucesso.');
});

const resolveReport = asyncHandler(async (req, res) => {
  const updated = await adminService.resolveReport(
    req.params.id,
    req.body,
    req.user,
    extractRequestMeta(req)
  );
  return ApiResponse.success(res, updated, 'Denúncia atualizada com sucesso.');
});

const listAuditLogs = asyncHandler(async (req, res) => {
  const pagination = parsePagination(req.query, { defaultLimit: 30 });
  const filters = {
    action: req.query.action,
    entityType: req.query.entityType,
    actorUserId: req.query.actorUserId
  };
  const result = await adminService.listAuditLogs(filters, pagination);
  return ApiResponse.paginated(res, result.items, result.pagination, 'Registos de auditoria obtidos.');
});

const getGlobalSettings = asyncHandler(async (_req, res) => {
  const settings = await adminService.getGlobalSettings();
  return ApiResponse.success(res, settings, 'Configurações globais obtidas com sucesso.');
});

const updateGlobalSettings = asyncHandler(async (req, res) => {
  const updated = await adminService.updateGlobalSettings(
    req.body.settings,
    req.user,
    extractRequestMeta(req)
  );
  return ApiResponse.success(res, updated, 'Configurações globais atualizadas com sucesso.');
});

module.exports = {
  getOverview,
  createCompanyAccount,
  listCompanies,
  getCompanyDetails,
  updateCompanyStatus,
  assignCompanyPlan,
  listPlans,
  updatePlan,
  listSubscriptions,
  listPayments,
  listUsers,
  updateUserStatus,
  listDestinationsForModeration,
  moderateDestination,
  listExperiencesForModeration,
  moderateExperience,
  listBookings,
  listReports,
  resolveReport,
  listAuditLogs,
  getGlobalSettings,
  updateGlobalSettings
};