'use strict';

const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/ApiResponse');
const { parsePagination } = require('../../utils/pagination');
const expeditionService = require('../../services/expedition.service');

function extractRequestMeta(req) {
  return {
    ip: req.ip || (req.connection && req.connection.remoteAddress) || null,
    userAgent: req.get('user-agent') || null
  };
}

const listPublic = asyncHandler(async (req, res) => {
  const pagination = parsePagination(req.query, {
    defaultLimit: 12,
    allowedSortColumns: ['start_date', 'price_per_participant', 'created_at', 'max_capacity'],
    defaultSortBy: 'start_date',
    defaultSortOrder: 'ASC'
  });

  const filters = {
    search: req.query.search,
    destinationId: req.query.destinationId,
    companyId: req.query.companyId,
    status: req.query.status,
    startDateFrom: req.query.startDateFrom,
    startDateTo: req.query.startDateTo,
    minPrice: req.query.minPrice,
    maxPrice: req.query.maxPrice,
    hasAvailability: req.query.hasAvailability
  };

  const result = await expeditionService.listPublicExpeditions(filters, pagination);
  return ApiResponse.paginated(res, result.items, result.pagination, 'Expedições obtidas com sucesso.');
});

const getPublicDetail = asyncHandler(async (req, res) => {
  const expedition = await expeditionService.getPublicExpeditionByIdOrSlug(
    req.params.idOrSlug,
    req.user || null
  );
  return ApiResponse.success(res, expedition, 'Expedição obtida com sucesso.');
});

const listCompanyExpeditions = asyncHandler(async (req, res) => {
  const pagination = parsePagination(req.query, { defaultLimit: 20 });
  const filters = {
    status: req.query.status,
    search: req.query.search
  };
  const result = await expeditionService.listCompanyExpeditions(req.company.id, filters, pagination);
  return ApiResponse.paginated(res, result.items, result.pagination, 'Expedições da empresa obtidas com sucesso.');
});

const createCompanyExpedition = asyncHandler(async (req, res) => {
  const payload = {
    ...req.body,
    coverImageUrl: req.uploadedFile ? req.uploadedFile.url : req.body.coverImageUrl
  };

  const expedition = await expeditionService.createCompanyExpedition(
    req.company.id,
    payload,
    req.user,
    extractRequestMeta(req)
  );
  return ApiResponse.created(res, expedition, 'Expedição criada com sucesso.');
});

const updateCompanyExpedition = asyncHandler(async (req, res) => {
  const payload = {
    ...req.body,
    ...(req.uploadedFile ? { coverImageUrl: req.uploadedFile.url } : {})
  };

  const updated = await expeditionService.updateCompanyExpedition(
    req.params.id,
    req.company.id,
    payload,
    req.user,
    extractRequestMeta(req)
  );
  return ApiResponse.success(res, updated, 'Expedição atualizada com sucesso.');
});

const listParticipants = asyncHandler(async (req, res) => {
  const participants = await expeditionService.listExpeditionParticipants(
    req.params.id,
    req.company.id
  );
  return ApiResponse.success(res, participants, 'Lista de participantes obtida com sucesso.');
});

module.exports = {
  listPublic,
  getPublicDetail,
  listCompanyExpeditions,
  createCompanyExpedition,
  updateCompanyExpedition,
  listParticipants
};