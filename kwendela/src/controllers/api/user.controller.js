'use strict';

const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/ApiResponse');
const { parsePagination } = require('../../utils/pagination');
const userService = require('../../services/user.service');

function extractRequestMeta(req) {
  return {
    ip: req.ip || (req.connection && req.connection.remoteAddress) || null,
    userAgent: req.get('user-agent') || null
  };
}

const getMyProfile = asyncHandler(async (req, res) => {
  const profile = await userService.getMyProfile(req.user.id);
  return ApiResponse.success(res, profile, 'Perfil obtido com sucesso.');
});

const updateMyProfile = asyncHandler(async (req, res) => {
  const updated = await userService.updateMyProfile(
    req.user.id,
    req.body,
    extractRequestMeta(req)
  );
  return ApiResponse.success(res, updated, 'Perfil atualizado com sucesso.');
});

const updateMyAvatar = asyncHandler(async (req, res) => {
  const avatarUrl = req.uploadedFile ? req.uploadedFile.url : req.body.avatarUrl;
  const updated = await userService.updateMyAvatar(req.user.id, avatarUrl);
  return ApiResponse.success(res, updated, 'Avatar atualizado com sucesso.');
});

const listMyFavorites = asyncHandler(async (req, res) => {
  const pagination = parsePagination(req.query, { defaultLimit: 12 });
  const result = await userService.listMyFavorites(req.user.id, pagination);
  return ApiResponse.paginated(res, result.items, result.pagination, 'Favoritos obtidos com sucesso.');
});

const getMyTripsSummary = asyncHandler(async (req, res) => {
  const summary = await userService.getMyTripsSummary(req.user.id);
  return ApiResponse.success(res, summary, 'Resumo de viagens obtido com sucesso.');
});

module.exports = {
  getMyProfile,
  updateMyProfile,
  updateMyAvatar,
  listMyFavorites,
  getMyTripsSummary
};