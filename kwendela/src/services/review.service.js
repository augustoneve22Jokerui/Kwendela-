'use strict';

const { withTransaction } = require('../config/database');
const ApiError = require('../utils/ApiError');
const { buildPaginationMeta } = require('../utils/pagination');
const reviewRepository = require('../repositories/review.repository');
const bookingRepository = require('../repositories/booking.repository');
const destinationRepository = require('../repositories/destination.repository');
const experienceRepository = require('../repositories/experience.repository');
const companyRepository = require('../repositories/company.repository');

async function resolveAndValidateTarget(targetType, targetId) {
  if (targetType === 'destination') {
    const dest = await destinationRepository.findById(targetId);
    if (!dest) throw ApiError.notFound('Destino não encontrado.');
    return { targetCompanyId: dest.company_id || null };
  }

  if (targetType === 'experience') {
    const exp = await experienceRepository.findById(targetId);
    if (!exp) throw ApiError.notFound('Experiência não encontrada.');
    return { targetCompanyId: exp.company_id || null };
  }

  if (targetType === 'company') {
    const comp = await companyRepository.findById(targetId);
    if (!comp) throw ApiError.notFound('Empresa não encontrada.');
    return { targetCompanyId: comp.id };
  }

  throw ApiError.badRequest('Tipo de entidade avaliada inválido.');
}

async function listReviews(filters, pagination) {
  const { items, total } = await reviewRepository.findPublic(filters, pagination);
  return {
    items,
    pagination: buildPaginationMeta({
      page: pagination.page,
      limit: pagination.limit,
      total
    })
  };
}

async function listUserReviews(userId, pagination) {
  const { items, total } = await reviewRepository.findByUser(userId, pagination);
  return {
    items,
    pagination: buildPaginationMeta({
      page: pagination.page,
      limit: pagination.limit,
      total
    })
  };
}

async function createReview(payload, user) {
  const { targetCompanyId } = await resolveAndValidateTarget(payload.targetType, payload.targetId);

  const existing = await reviewRepository.findByUserAndTarget(
    user.id,
    payload.targetType,
    payload.targetId
  );
  if (existing) {
    throw ApiError.conflict('Já submeteu uma avaliação para este item.');
  }

  let isVerifiedBooking = false;
  if (payload.bookingId) {
    const booking = await bookingRepository.findById(payload.bookingId);
    if (!booking || String(booking.user_id) !== String(user.id)) {
      throw ApiError.forbidden('A reserva associada não pertence ao utilizador.');
    }
    isVerifiedBooking = ['confirmed', 'checked_in', 'completed'].includes(booking.status);
  }

  return withTransaction(async (client) => {
    const review = await reviewRepository.createReview(
      {
        userId: user.id,
        targetType: payload.targetType,
        targetId: payload.targetId,
        targetCompanyId,
        bookingId: payload.bookingId || null,
        rating: Number(payload.rating),
        title: payload.title || null,
        comment: payload.comment,
        isVerifiedBooking
      },
      client
    );

    await reviewRepository.recalculateTargetRating(payload.targetType, payload.targetId, client);
    return review;
  });
}

async function updateReview(reviewId, payload, user) {
  const existing = await reviewRepository.findById(reviewId);
  if (!existing) {
    throw ApiError.notFound('Avaliação não encontrada.');
  }

  if (String(existing.user_id) !== String(user.id)) {
    throw ApiError.forbidden('Não tem permissão para editar esta avaliação.');
  }

  return withTransaction(async (client) => {
    const updated = await reviewRepository.updateReview(reviewId, payload, client);
    await reviewRepository.recalculateTargetRating(existing.target_type, existing.target_id, client);
    return updated;
  });
}

async function deleteReview(reviewId, user) {
  const existing = await reviewRepository.findById(reviewId);
  if (!existing) {
    throw ApiError.notFound('Avaliação não encontrada.');
  }

  if (String(existing.user_id) !== String(user.id) && user.role !== 'superadmin') {
    throw ApiError.forbidden('Não tem permissão para remover esta avaliação.');
  }

  return withTransaction(async (client) => {
    await reviewRepository.deleteReview(reviewId, client);
    await reviewRepository.recalculateTargetRating(existing.target_type, existing.target_id, client);
    return { deleted: true };
  });
}

async function replyToReview(reviewId, companyId, { companyReply }) {
  const existing = await reviewRepository.findById(reviewId);
  if (!existing) {
    throw ApiError.notFound('Avaliação não encontrada.');
  }

  if (!existing.target_company_id || String(existing.target_company_id) !== String(companyId)) {
    throw ApiError.forbidden('Esta avaliação não pertence a um recurso da sua empresa.');
  }

  return reviewRepository.setCompanyReply(reviewId, companyReply);
}

module.exports = {
  listReviews,
  listUserReviews,
  createReview,
  updateReview,
  deleteReview,
  replyToReview
};