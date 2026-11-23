'use strict';

const ApiError = require('../utils/ApiError');
const { buildPaginationMeta } = require('../utils/pagination');
const { removeUploadedFileByUrl } = require('../config/multer');
const { recordAuditLog } = require('../middlewares/audit.middleware');
const userRepository = require('../repositories/user.repository');
const destinationRepository = require('../repositories/destination.repository');
const bookingRepository = require('../repositories/booking.repository');
const walletRepository = require('../repositories/wallet.repository');

async function getMyProfile(userId) {
  const user = await userRepository.findProfileById(userId);
  if (!user) {
    throw ApiError.notFound('Perfil de utilizador não encontrado.');
  }

  const wallet = await walletRepository.findByUserId(userId);

  return {
    ...user,
    wallet: wallet
      ? {
          id: wallet.id,
          accountCode: wallet.account_code,
          availableBalance: Number(wallet.available_balance),
          reservedBalance: Number(wallet.reserved_balance),
          currency: wallet.currency
        }
      : null
  };
}

async function updateMyProfile(userId, payload, requestMeta = {}) {
  const existing = await userRepository.findById(userId);
  if (!existing) {
    throw ApiError.notFound('Utilizador não encontrado.');
  }

  const updated = await userRepository.updateProfile(userId, payload);

  await recordAuditLog({
    actorUserId: userId,
    action: 'user.update_profile',
    entityType: 'user',
    entityId: userId,
    ipAddress: requestMeta.ip,
    userAgent: requestMeta.userAgent,
    metadata: { updatedFields: Object.keys(payload) }
  });

  return updated;
}

async function updateMyAvatar(userId, newAvatarUrl) {
  if (!newAvatarUrl) {
    throw ApiError.badRequest('Imagem de avatar obrigatória.');
  }

  const existing = await userRepository.findById(userId);
  if (!existing) {
    throw ApiError.notFound('Utilizador não encontrado.');
  }

  const updated = await userRepository.updateAvatar(userId, newAvatarUrl);

  if (existing.avatar_url && existing.avatar_url.startsWith('/uploads/')) {
    removeUploadedFileByUrl(existing.avatar_url);
  }

  return updated;
}

async function listMyFavorites(userId, pagination) {
  const { items, total } = await destinationRepository.findUserFavorites(userId, pagination);
  return {
    items,
    pagination: buildPaginationMeta({
      page: pagination.page,
      limit: pagination.limit,
      total
    })
  };
}

async function getMyTripsSummary(userId) {
  const [bookingsResult, waitlistEntries] = await Promise.all([
    bookingRepository.findByUser(userId, {}, { page: 1, limit: 50, offset: 0 }),
    bookingRepository.findUserWaitlistEntries(userId)
  ]);

  const now = new Date();
  const upcoming = [];
  const past = [];

  for (const booking of bookingsResult.items) {
    const tripDate = booking.scheduled_date ? new Date(booking.scheduled_date) : null;
    if (
      tripDate &&
      tripDate >= now &&
      ['confirmed', 'checked_in', 'pending_payment'].includes(booking.status)
    ) {
      upcoming.push(booking);
    } else {
      past.push(booking);
    }
  }

  return {
    upcoming,
    past,
    waitlist: waitlistEntries
  };
}

module.exports = {
  getMyProfile,
  updateMyProfile,
  updateMyAvatar,
  listMyFavorites,
  getMyTripsSummary
};