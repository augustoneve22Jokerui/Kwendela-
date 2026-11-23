'use strict';

const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/ApiResponse');
const { parsePagination } = require('../../utils/pagination');
const reviewService = require('../../services/review.service');

const listPublic = asyncHandler(async (req, res) => {
  const pagination = parsePagination(req.query, { defaultLimit: 12 });
  const filters = {
    targetType: req.query.targetType,
    targetId: req.query.targetId,
    minRating: req.query.minRating
  };
  const result = await reviewService.listReviews(filters, pagination);
  return ApiResponse.paginated(res, result.items, result.pagination, 'Avaliações obtidas com sucesso.');
});

const listMyReviews = asyncHandler(async (req, res) => {
  const pagination = parsePagination(req.query, { defaultLimit: 12 });
  const result = await reviewService.listUserReviews(req.user.id, pagination);
  return ApiResponse.paginated(res, result.items, result.pagination, 'As suas avaliações foram obtidas.');
});

const createReview = asyncHandler(async (req, res) => {
  const review = await reviewService.createReview(req.body, req.user);
  return ApiResponse.created(res, review, 'Avaliação publicada com sucesso.');
});

const updateReview = asyncHandler(async (req, res) => {
  const updated = await reviewService.updateReview(req.params.id, req.body, req.user);
  return ApiResponse.success(res, updated, 'Avaliação atualizada com sucesso.');
});

const deleteReview = asyncHandler(async (req, res) => {
  const result = await reviewService.deleteReview(req.params.id, req.user);
  return ApiResponse.success(res, result, 'Avaliação removida com sucesso.');
});

const replyReview = asyncHandler(async (req, res) => {
  const updated = await reviewService.replyToReview(req.params.id, req.company.id, req.body);
  return ApiResponse.success(res, updated, 'Resposta da empresa publicada com sucesso.');
});

module.exports = {
  listPublic,
  listMyReviews,
  createReview,
  updateReview,
  deleteReview,
  replyReview
};