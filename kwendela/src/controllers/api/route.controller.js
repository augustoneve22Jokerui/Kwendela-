'use strict';

const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/ApiResponse');
const { parsePagination } = require('../../utils/pagination');
const routeService = require('../../services/route.service');

function extractRequestMeta(req) {
  return {
    ip: req.ip || (req.connection && req.connection.remoteAddress) || null,
    userAgent: req.get('user-agent') || null
  };
}

const listRoutes = asyncHandler(async (req, res) => {
  const pagination = parsePagination(req.query, { defaultLimit: 12 });
  const filters = {
    onlyPublic: req.query.onlyPublic === 'true',
    filterCompanyId: req.query.companyId,
    destinationId: req.query.destinationId,
    search: req.query.search
  };

  const result = await routeService.listRoutes(filters, pagination, req.user || null);
  return ApiResponse.paginated(res, result.items, result.pagination, 'Rotas obtidas com sucesso.');
});

const getRouteById = asyncHandler(async (req, res) => {
  const route = await routeService.getRouteById(req.params.id, req.user || null);
  return ApiResponse.success(res, route, 'Rota obtida com sucesso.');
});

const createRoute = asyncHandler(async (req, res) => {
  const route = await routeService.createRoute(req.body, req.user, extractRequestMeta(req));
  return ApiResponse.created(res, route, 'Rota criada com sucesso.');
});

const updateRoute = asyncHandler(async (req, res) => {
  const updated = await routeService.updateRoute(
    req.params.id,
    req.body,
    req.user,
    extractRequestMeta(req)
  );
  return ApiResponse.success(res, updated, 'Rota atualizada com sucesso.');
});

const addWaypoint = asyncHandler(async (req, res) => {
  const updated = await routeService.addWaypoint(req.params.id, req.body, req.user);
  return ApiResponse.created(res, updated, 'Ponto de interesse adicionado à rota.');
});

const deleteRoute = asyncHandler(async (req, res) => {
  const result = await routeService.deleteRoute(req.params.id, req.user);
  return ApiResponse.success(res, result, 'Rota removida com sucesso.');
});

module.exports = {
  listRoutes,
  getRouteById,
  createRoute,
  updateRoute,
  addWaypoint,
  deleteRoute
};