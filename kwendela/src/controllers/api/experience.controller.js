'use strict';

const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/ApiResponse');
const { parsePagination } = require('../../utils/pagination');
const experienceService = require('../../services/experience.service');

function extractRequestMeta(req) {
  return {
    ip: req.ip || (req.connection && req.connection.remoteAddress) || null,
    userAgent: req.get('user-agent') || null
  };
}

const listPublic = asyncHandler(async (req, res) => {
  const pagination = parsePagination(req.query, {
    defaultLimit: 12,
    allowedSortColumns: ['created_at', 'price_kz', 'rating_avg', 'duration_hours', 'title'],
    defaultSortBy: 'created_at',
    defaultSortOrder: 'DESC'
  });

  const filters = {
    search: req.query.search,
    destinationId: req.query.destinationId,
    companyId: req.query.companyId,
    province: req.query.province,
    category: req.query.category,
    experienceType: req.query.experienceType,
    difficultyLevel: req.query.difficultyLevel,
    minPrice: req.query.minPrice,
    maxPrice: req.query.maxPrice
  };

  const result = await experienceService.listPublicExperiences(filters, pagination);
  return ApiResponse.paginated(res, result.items, result.pagination, 'Experiências obtidas com sucesso.');
});

const getPublicDetail = asyncHandler(async (req, res) => {
  const experience = await experienceService.getPublicExperienceByIdOrSlug(req.params.idOrSlug);
  return ApiResponse.success(res, experience, 'Experiência obtida com sucesso.');
});

const listCompanyExperiences = asyncHandler(async (req, res) => {
  const pagination = parsePagination(req.query, { defaultLimit: 20 });
  const filters = {
    moderationStatus: req.query.moderationStatus,
    experienceType: req.query.experienceType,
    search: req.query.search
  };
  const result = await experienceService.listCompanyExperiences(req.company.id, filters, pagination);
  return ApiResponse.paginated(res, result.items, result.pagination, 'Experiências da empresa obtidas com sucesso.');
});

const createCompanyExperience = asyncHandler(async (req, res) => {
  const payload = {
    ...req.body,
    coverImageUrl: req.uploadedFile ? req.uploadedFile.url : req.body.coverImageUrl
  };

  const experience = await experienceService.createCompanyExperience(
    req.company.id,
    payload,
    req.user,
    extractRequestMeta(req)
  );
  return ApiResponse.created(res, experience, 'Experiência criada e submetida para moderação.');
});

const updateCompanyExperience = asyncHandler(async (req, res) => {
  const payload = {
    ...req.body,
    ...(req.uploadedFile ? { coverImageUrl: req.uploadedFile.url } : {})
  };

  const updated = await experienceService.updateCompanyExperience(
    req.params.id,
    req.company.id,
    payload,
    req.user,
    extractRequestMeta(req)
  );
  return ApiResponse.success(res, updated, 'Experiência atualizada com sucesso.');
});

const archiveCompanyExperience = asyncHandler(async (req, res) => {
  const result = await experienceService.archiveCompanyExperience(
    req.params.id,
    req.company.id,
    req.user,
    extractRequestMeta(req)
  );
  return ApiResponse.success(res, result, 'Experiência arquivada com sucesso.');
});

const addMedia = asyncHandler(async (req, res) => {
  const mediaUrl = req.uploadedFile ? req.uploadedFile.url : req.body.url;
  const inferredType =
    req.uploadedFile && req.uploadedFile.mimeType && req.uploadedFile.mimeType.startsWith('video/')
      ? 'video'
      : req.body.mediaType || 'image';

  const media = await experienceService.addExperienceMedia(
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
  return ApiResponse.created(res, media, 'Item multimédia adicionado à experiência.');
});

const removeMedia = asyncHandler(async (req, res) => {
  const result = await experienceService.removeExperienceMedia(
    req.params.id,
    req.params.mediaId,
    req.company.id
  );
  return ApiResponse.success(res, result, 'Item multimédia removido com sucesso.');
});

module.exports = {
  listPublic,
  getPublicDetail,
  listCompanyExperiences,
  createCompanyExperience,
  updateCompanyExperience,
  archiveCompanyExperience,
  addMedia,
  removeMedia
};