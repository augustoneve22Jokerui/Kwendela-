'use strict';

const { withTransaction } = require('../config/database');
const ApiError = require('../utils/ApiError');
const { generateBookingReference } = require('../utils/crypto');
const { buildPaginationMeta } = require('../utils/pagination');
const { recordAuditLog } = require('../middlewares/audit.middleware');
const { promoteWaitlistForExpedition } = require('../jobs/waitlist.job');
const bookingRepository = require('../repositories/booking.repository');
const expeditionRepository = require('../repositories/expedition.repository');
const experienceRepository = require('../repositories/experience.repository');
const walletService = require('./wallet.service');
const notificationService = require('./notification.service');

async function createBooking(payload, user, requestMeta = {}) {
  if (payload.idempotencyKey) {
    const existing = await bookingRepository.findByIdempotencyKey(payload.idempotencyKey, user.id);
    if (existing) {
      return existing;
    }
  }

  const participantsCount = Number(payload.participantsCount || 1);

  const created = await withTransaction(async (client) => {
    let companyId;
    let unitPriceKz;
    let bookingTitle;
    let scheduledDate = payload.scheduledDate || null;
    let expeditionId = null;
    let experienceId = null;

    if (payload.expeditionId) {
      const expedition = await expeditionRepository.findByIdForUpdate(payload.expeditionId, client);
      if (!expedition) {
        throw ApiError.notFound('Expedição não encontrada.');
      }

      if (!['published', 'open'].includes(expedition.status)) {
        throw ApiError.conflict(
          'Esta expedição não está aberta para novas reservas.',
          'EXPEDITION_NOT_OPEN'
        );
      }

      const heldSpots = await bookingRepository.countActiveWaitlistHolds(expedition.id, client);
      const availableSpots =
        Number(expedition.max_capacity) - Number(expedition.reserved_spots) - Number(heldSpots);

      if (availableSpots < participantsCount) {
        throw ApiError.conflict(
          expedition.waitlist_enabled
            ? 'Não existem vagas suficientes disponíveis. Pode entrar na lista de espera desta expedição.'
            : 'Não existem vagas suficientes disponíveis para esta expedição.',
          'INSUFFICIENT_SPOTS',
          {
            availableSpots: Math.max(0, availableSpots),
            waitlistEnabled: Boolean(expedition.waitlist_enabled)
          }
        );
      }

      const newReserved = Number(expedition.reserved_spots) + participantsCount;
      const newStatus = newReserved >= Number(expedition.max_capacity) ? 'full' : expedition.status;

      await expeditionRepository.updateReservedSpots(
        expedition.id,
        { reservedSpots: newReserved, status: newStatus },
        client
      );

      companyId = expedition.company_id;
      unitPriceKz = Number(expedition.price_per_participant);
      bookingTitle = expedition.title;
      scheduledDate = expedition.start_date;
      expeditionId = expedition.id;
      experienceId = expedition.experience_id || null;
    } else {
      const experience = await experienceRepository.findById(payload.experienceId, client);
      if (!experience) {
        throw ApiError.notFound('Experiência não encontrada.');
      }

      if (!experience.is_active || experience.moderation_status !== 'approved') {
        throw ApiError.badRequest('Esta experiência não está disponível para reserva.');
      }

      if (participantsCount > Number(experience.max_group_size)) {
        throw ApiError.badRequest(
          `O número de participantes excede o máximo permitido (${experience.max_group_size}).`
        );
      }

      if (!scheduledDate) {
        throw ApiError.badRequest('A data pretendida é obrigatória para reservar uma experiência.');
      }

      companyId = experience.company_id;
      unitPriceKz = Number(experience.price_kz);
      bookingTitle = experience.title;
      experienceId = experience.id;
    }

    const totalPriceKz = Number((unitPriceKz * participantsCount).toFixed(2));
    const referenceCode = generateBookingReference('RES');

    const booking = await bookingRepository.createBooking(
      {
        referenceCode,
        userId: user.id,
        companyId,
        expeditionId,
        experienceId,
        bookingType: expeditionId ? 'expedition' : 'experience',
        scheduledDate,
        participantsCount,
        unitPriceKz,
        totalPriceKz,
        specialRequests: payload.specialRequests || null,
        status: 'confirmed',
        paymentStatus: totalPriceKz === 0 ? 'paid' : 'pending',
        paymentMethod: payload.paymentMethod || 'wallet',
        idempotencyKey: payload.idempotencyKey || null
      },
      client
    );

    if (Array.isArray(payload.participants) && payload.participants.length > 0) {
      await bookingRepository.addParticipants(booking.id, payload.participants, client);
    }

    let paymentTransaction = null;
    if (totalPriceKz > 0) {
      paymentTransaction = await walletService.payBookingWithinTransaction(
        client,
        {
          userId: user.id,
          companyId,
          bookingId: booking.id,
          bookingReference: referenceCode,
          amount: totalPriceKz,
          paymentMethod: payload.paymentMethod || 'wallet',
          idempotencyKey: payload.idempotencyKey ? `booking:${payload.idempotencyKey}` : null
        }
      );

      await bookingRepository.markPaymentPaid(booking.id, paymentTransaction.id, client);
      booking.payment_status = 'paid';
    }

    return {
      booking,
      bookingTitle,
      companyId,
      paymentTransaction
    };
  });

  await recordAuditLog({
    actorUserId: user.id,
    companyId: created.companyId,
    action: 'booking.create',
    entityType: 'booking',
    entityId: created.booking.id,
    ipAddress: requestMeta.ip,
    userAgent: requestMeta.userAgent,
    metadata: {
      referenceCode: created.booking.reference_code,
      totalPriceKz: created.booking.total_price_kz,
      participantsCount: created.booking.participants_count
    }
  });

  await notificationService.createNotification({
    userId: user.id,
    type: 'booking_confirmed',
    title: 'Reserva confirmada',
    message: `A sua reserva ${created.booking.reference_code} para "${created.bookingTitle}" foi confirmada.`,
    referenceType: 'booking',
    referenceId: created.booking.id
  });

  await notificationService.notifyCompanyAdmins(created.companyId, {
    type: 'new_booking_received',
    title: 'Nova reserva recebida',
    message: `Nova reserva ${created.booking.reference_code} (${created.booking.participants_count} participante(s)) para "${created.bookingTitle}".`,
    referenceType: 'booking',
    referenceId: created.booking.id
  });

  return created.booking;
}

async function joinWaitlist(expeditionId, payload, user) {
  const participantsCount = Number(payload.participantsCount || 1);

  return withTransaction(async (client) => {
    const expedition = await expeditionRepository.findByIdForUpdate(expeditionId, client);
    if (!expedition) {
      throw ApiError.notFound('Expedição não encontrada.');
    }

    if (!expedition.waitlist_enabled) {
      throw ApiError.badRequest('A lista de espera não está ativada para esta expedição.');
    }

    if (!['published', 'open', 'full'].includes(expedition.status)) {
      throw ApiError.badRequest('Esta expedição já não aceita inscrições em lista de espera.');
    }

    const existing = await bookingRepository.findActiveWaitlistEntry(expeditionId, user.id, client);
    if (existing) {
      throw ApiError.conflict(
        'Já se encontra na lista de espera desta expedição.',
        'ALREADY_ON_WAITLIST'
      );
    }

    const heldSpots = await bookingRepository.countActiveWaitlistHolds(expeditionId, client);
    const availableSpots =
      Number(expedition.max_capacity) - Number(expedition.reserved_spots) - Number(heldSpots);

    if (availableSpots >= participantsCount) {
      throw ApiError.badRequest(
        'Existem vagas disponíveis neste momento. Pode efetuar a reserva diretamente.',
        null,
        'SPOTS_AVAILABLE'
      );
    }

    const nextPosition = await bookingRepository.getNextWaitlistPosition(expeditionId, client);

    return bookingRepository.createWaitlistEntry(
      {
        expeditionId,
        userId: user.id,
        participantsCount,
        position: nextPosition,
        notes: payload.notes || null
      },
      client
    );
  });
}

async function confirmWaitlistSpot(waitlistId, payload, user, requestMeta = {}) {
  const result = await withTransaction(async (client) => {
    const entry = await bookingRepository.findWaitlistByIdForUpdate(waitlistId, client);
    if (!entry) {
      throw ApiError.notFound('Registo de lista de espera não encontrado.');
    }

    if (String(entry.user_id) !== String(user.id)) {
      throw ApiError.forbidden('Não tem permissão para confirmar esta vaga.');
    }

    if (entry.status !== 'notified') {
      throw ApiError.conflict(
        'Esta vaga da lista de espera não está pendente de confirmação.',
        'WAITLIST_NOT_NOTIFIED'
      );
    }

    if (entry.confirmation_deadline_at && new Date(entry.confirmation_deadline_at) <= new Date()) {
      throw ApiError.conflict(
        'O prazo de confirmação desta vaga já expirou.',
        'WAITLIST_EXPIRED'
      );
    }

    const expedition = await expeditionRepository.findByIdForUpdate(entry.expedition_id, client);
    if (!expedition) {
      throw ApiError.notFound('Expedição não encontrada.');
    }

    const participantsCount = Number(entry.participants_count);
    const freeSpots = Number(expedition.max_capacity) - Number(expedition.reserved_spots);
    if (freeSpots < participantsCount) {
      throw ApiError.conflict('Vagas insuficientes no momento da confirmação.');
    }

    const newReserved = Number(expedition.reserved_spots) + participantsCount;
    const newStatus = newReserved >= Number(expedition.max_capacity) ? 'full' : expedition.status;

    await expeditionRepository.updateReservedSpots(
      expedition.id,
      { reservedSpots: newReserved, status: newStatus },
      client
    );

    const unitPriceKz = Number(expedition.price_per_participant);
    const totalPriceKz = Number((unitPriceKz * participantsCount).toFixed(2));
    const referenceCode = generateBookingReference('RES');

    const booking = await bookingRepository.createBooking(
      {
        referenceCode,
        userId: user.id,
        companyId: expedition.company_id,
        expeditionId: expedition.id,
        experienceId: expedition.experience_id || null,
        bookingType: 'expedition',
        scheduledDate: expedition.start_date,
        participantsCount,
        unitPriceKz,
        totalPriceKz,
        specialRequests: payload.specialRequests || null,
        status: 'confirmed',
        paymentStatus: totalPriceKz === 0 ? 'paid' : 'pending',
        paymentMethod: payload.paymentMethod || 'wallet',
        idempotencyKey: payload.idempotencyKey || null
      },
      client
    );

    if (Array.isArray(payload.participants) && payload.participants.length > 0) {
      await bookingRepository.addParticipants(booking.id, payload.participants, client);
    }

    if (totalPriceKz > 0) {
      const paymentTx = await walletService.payBookingWithinTransaction(client, {
        userId: user.id,
        companyId: expedition.company_id,
        bookingId: booking.id,
        bookingReference: referenceCode,
        amount: totalPriceKz,
        paymentMethod: payload.paymentMethod || 'wallet',
        idempotencyKey: payload.idempotencyKey ? `waitlist:${payload.idempotencyKey}` : null
      });
      await bookingRepository.markPaymentPaid(booking.id, paymentTx.id, client);
      booking.payment_status = 'paid';
    }

    await bookingRepository.markWaitlistConfirmed(entry.id, booking.id, client);

    return {
      booking,
      expeditionTitle: expedition.title,
      companyId: expedition.company_id
    };
  });

  await recordAuditLog({
    actorUserId: user.id,
    companyId: result.companyId,
    action: 'booking.confirm_waitlist',
    entityType: 'booking',
    entityId: result.booking.id,
    ipAddress: requestMeta.ip,
    userAgent: requestMeta.userAgent
  });

  return result.booking;
}

async function cancelBooking(bookingId, { reason = null } = {}, user, requestMeta = {}) {
  const outcome = await withTransaction(async (client) => {
    const booking = await bookingRepository.findByIdForUpdate(bookingId, client);
    if (!booking) {
      throw ApiError.notFound('Reserva não encontrada.');
    }

    const isOwner = String(booking.user_id) === String(user.id);
    const isCompanyAdmin =
      user.companyId &&
      String(booking.company_id) === String(user.companyId) &&
      ['company_owner', 'company_admin', 'company_staff'].includes(user.role);
    const isSuperadmin = user.role === 'superadmin';

    if (!isOwner && !isCompanyAdmin && !isSuperadmin) {
      throw ApiError.forbidden('Não tem permissão para cancelar esta reserva.');
    }

    if (!['pending_payment', 'confirmed'].includes(booking.status)) {
      throw ApiError.conflict('Esta reserva não pode ser cancelada no estado atual.');
    }

    const updatedBooking = await bookingRepository.updateStatus(
      booking.id,
      {
        status: 'cancelled',
        cancellationReason: reason || 'Cancelada pelo utilizador.',
        cancelledByUserId: user.id
      },
      client
    );

    if (booking.payment_status === 'paid' && Number(booking.total_price_kz) > 0) {
      await walletService.refundBookingWithinTransaction(client, {
        bookingId: booking.id,
        bookingReference: booking.reference_code,
        userId: booking.user_id,
        companyId: booking.company_id,
        amount: Number(booking.total_price_kz)
      });
      await bookingRepository.markPaymentRefunded(booking.id, client);
      updatedBooking.payment_status = 'refunded';
      updatedBooking.status = 'refunded';
    }

    let promotedWaitlistCount = 0;
    if (booking.expedition_id) {
      const expedition = await expeditionRepository.findByIdForUpdate(booking.expedition_id, client);
      if (expedition) {
        const decremented = Math.max(
          0,
          Number(expedition.reserved_spots) - Number(booking.participants_count)
        );
        const reopenedStatus =
          expedition.status === 'full' && decremented < Number(expedition.max_capacity)
            ? 'open'
            : expedition.status;

        await expeditionRepository.updateReservedSpots(
          expedition.id,
          { reservedSpots: decremented, status: reopenedStatus },
          client
        );

        promotedWaitlistCount = await promoteWaitlistForExpedition(client, expedition.id);
      }
    }

    return {
      booking: updatedBooking,
      promotedWaitlistCount
    };
  });

  await recordAuditLog({
    actorUserId: user.id,
    companyId: outcome.booking.company_id,
    action: 'booking.cancel',
    entityType: 'booking',
    entityId: bookingId,
    ipAddress: requestMeta.ip,
    userAgent: requestMeta.userAgent,
    metadata: {
      reason: reason || null,
      promotedWaitlistCount: outcome.promotedWaitlistCount
    }
  });

  return outcome;
}

async function updateCompanyBookingStatus(bookingId, companyId, payload, actor, requestMeta = {}) {
  if (payload.status === 'cancelled') {
    return cancelBooking(bookingId, { reason: payload.reason }, actor, requestMeta);
  }

  const booking = await bookingRepository.findById(bookingId);
  if (!booking || String(booking.company_id) !== String(companyId)) {
    throw ApiError.notFound('Reserva não encontrada para esta empresa.');
  }

  const updated = await bookingRepository.updateStatus(bookingId, {
    status: payload.status
  });

  await recordAuditLog({
    actorUserId: actor.id,
    companyId,
    action: 'booking.update_status',
    entityType: 'booking',
    entityId: bookingId,
    ipAddress: requestMeta.ip,
    userAgent: requestMeta.userAgent,
    metadata: { newStatus: payload.status }
  });

  return updated;
}

async function listTouristBookings(userId, filters, pagination) {
  const { items, total } = await bookingRepository.findByUser(userId, filters, pagination);
  return {
    items,
    pagination: buildPaginationMeta({
      page: pagination.page,
      limit: pagination.limit,
      total
    })
  };
}

async function listTouristWaitlist(userId) {
  return bookingRepository.findUserWaitlistEntries(userId);
}

async function listCompanyBookings(companyId, filters, pagination) {
  const { items, total } = await bookingRepository.findByCompany(companyId, filters, pagination);
  return {
    items,
    pagination: buildPaginationMeta({
      page: pagination.page,
      limit: pagination.limit,
      total
    })
  };
}

async function listExpeditionWaitlist(expeditionId, companyId) {
  const expedition = await expeditionRepository.findById(expeditionId);
  if (!expedition || String(expedition.company_id) !== String(companyId)) {
    throw ApiError.notFound('Expedição não encontrada para esta empresa.');
  }
  return bookingRepository.findWaitlistByExpedition(expeditionId);
}

async function getBookingDetails(bookingId, user) {
  const booking = await bookingRepository.findDetailedById(bookingId);
  if (!booking) {
    throw ApiError.notFound('Reserva não encontrada.');
  }

  const isOwner = String(booking.user_id) === String(user.id);
  const isCompanyUser = user.companyId && String(booking.company_id) === String(user.companyId);
  const isSuperadmin = user.role === 'superadmin';

  if (!isOwner && !isCompanyUser && !isSuperadmin) {
    throw ApiError.forbidden('Não tem acesso a esta reserva.');
  }

  return booking;
}

module.exports = {
  createBooking,
  joinWaitlist,
  confirmWaitlistSpot,
  cancelBooking,
  updateCompanyBookingStatus,
  listTouristBookings,
  listTouristWaitlist,
  listCompanyBookings,
  listExpeditionWaitlist,
  getBookingDetails
};