'use strict';

const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/ApiResponse');
const { parsePagination } = require('../../utils/pagination');
const destinationService = require('../../services/destination.service');

function extractRequestMeta(req) {
  return {
    ip: req.ip || (req.connection && req.connection.remoteAddress) || null,
    userAgent: req.get('user-agent') || null
  };
}

const listPublic = asyncHandler(async (req, res) => {
  const pagination = parsePagination(req.query, {
    defaultLimit: 12,
    allowedSortColumns: ['created_at', 'name', 'rating_avg', 'views_count'],
    defaultSortBy: 'created_at',
    defaultSortOrder: 'DESC'
  });

  const filters = {
    search: req.query.search,
    province: req.query.province,
    country: req.query.country,
    category: req.query.category,
    featured: req.query.featured
  };

  const result = await destinationService.listPublicDestinations(filters, pagination);
  return ApiResponse.paginated(res, result.items, result.pagination, 'Destinos obtidos com sucesso.');
});

const listProvinces = asyncHandler(async (_req, res) => {
  const provinces = await destinationService.listProvinces();
  return ApiResponse.success(res, provinces, 'Províncias disponíveis obtidas com sucesso.');
});

const getPublicDetail = asyncHandler(async (req, res) => {
  const destination = await destinationService.getPublicDestinationByIdOrSlug(
    req.params.idOrSlug,
    req.user || null
  );
  return ApiResponse.success(res, destination, 'Destino obtido com sucesso.');
});

const toggleFavorite = asyncHandler(async (req, res) => {
  const result = await destinationService.toggleFavorite(req.params.id, req.user.id);
  return ApiResponse.success(
    res,
    result,
    result.isFavorite ? 'Destino adicionado aos favoritos.' : 'Destino removido dos favoritos.'
  );
});

const listCompanyDestinations = asyncHandler(async (req, res) => {
  const pagination = parsePagination(req.query, { defaultLimit: 20 });
  const filters = {
    moderationStatus: req.query.moderationStatus,
    search: req.query.search
  };

  const result = await destinationService.listCompanyDestinations(
    req.company.id,
    filters,
    pagination
  );
  return ApiResponse.paginated(res, result.items, result.pagination, 'Destinos da empresa obtidos com sucesso.');
});

const createCompanyDestination = asyncHandler(async (req, res) => {
  const payload = {
    ...req.body,
    coverImageUrl: req.uploadedFile ? req.uploadedFile.url : req.body.coverImageUrl
  };

  const destination = await destinationService.createCompanyDestination(
    req.company.id,
    payload,
    req.user,
    extractRequestMeta(req)
  );
  return ApiResponse.created(res, destination, 'Destino criado e submetido para moderação.');
});

const updateCompanyDestination = asyncHandler(async (req, res) => {
  const payload = {
    ...req.body,
    ...(req.uploadedFile ? { coverImageUrl: req.uploadedFile.url } : {})
  };

  const updated = await destinationService.updateCompanyDestination(
    req.params.id,
    req.company.id,
    payload,
    req.user,
    extractRequestMeta(req)
  );
  return ApiResponse.success(res, updated, 'Destino atualizado com sucesso.');
});

const deleteCompanyDestination = asyncHandler(async (req, res) => {
  const result = await destinationService.deleteCompanyDestination(
    req.params.id,
    req.company.id,
    req.user,
    extractRequestMeta(req)
  );
  return ApiResponse.success(res, result, 'Destino arquivado com sucesso.');
});

const addMedia = asyncHandler(async (req, res) => {
  const mediaUrl = req.uploadedFile ? req.uploadedFile.url : req.body.url;
  const inferredType =
    req.uploadedFile && req.uploadedFile.mimeType && req.uploadedFile.mimeType.startsWith('video/')
      ? 'video'
      : req.body.mediaType || 'image';

  const media = await destinationService.addDestinationMedia(
    req.params.id,
    req.company.id,
    {
      mediaType: inferredType,
      url: mediaUrl,
      caption: req.body.caption,
      isCover: req.body.isCover,
      displayOrder: req.body.displayOrder
    },
    req.user
  );
  return ApiResponse.created(res, media, 'Item multimédia adicionado ao destino.');
});

const removeMedia = asyncHandler(async (req, res) => {
  const result = await destinationService.removeDestinationMedia(
    req.params.id,
    req.params.mediaId,
    req.company.id
  );
  return ApiResponse.success(res, result, 'Item multimédia removido com sucesso.');
});

module.exports = {
  listPublic,
  listProvinces,
  getPublicDetail,
  toggleFavorite,
  listCompanyDestinations,
  createCompanyDestination,
  updateCompanyDestination,
  deleteCompanyDestination,
  addMedia,
  removeMedia
};
