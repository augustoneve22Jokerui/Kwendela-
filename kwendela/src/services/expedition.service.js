'use strict';

const ApiError = require('../utils/ApiError');
const { generateUniqueSlug } = require('../utils/slug');
const { buildPaginationMeta } = require('../utils/pagination');
const { recordAuditLog } = require('../middlewares/audit.middleware');
const expeditionRepository = require('../repositories/expedition.repository');
const destinationRepository = require('../repositories/destination.repository');
const experienceRepository = require('../repositories/experience.repository');
const companyRepository = require('../repositories/company.repository');
const routeRepository = require('../repositories/route.repository');
const bookingRepository = require('../repositories/booking.repository');
const notificationService = require('./notification.service');

async function validateCompanyReferences(companyId, payload) {
  if (payload.destinationId) {
    const dest = await destinationRepository.findById(payload.destinationId);
    if (!dest || (dest.moderation_status !== 'approved' && String(dest.company_id) !== String(companyId))) {
      throw ApiError.badRequest('Destino inválido ou não aprovado para esta expedição.');
    }
  }

  if (payload.experienceId) {
    const exp = await experienceRepository.findById(payload.experienceId);
    if (!exp || String(exp.company_id) !== String(companyId)) {
      throw ApiError.badRequest('A experiência associada não pertence a esta empresa.');
    }
  }

  if (payload.guideId) {
    const guide = await companyRepository.findGuideById(companyId, payload.guideId);
    if (!guide || !guide.is_active) {
      throw ApiError.badRequest('Guia turístico inválido ou inativo para esta empresa.');
    }
  }

  if (payload.transportId) {
    const transport = await companyRepository.findTransportById(companyId, payload.transportId);
    if (!transport || !transport.is_active) {
      throw ApiError.badRequest('Transporte inválido ou inativo para esta empresa.');
    }
  }

  if (payload.routeId) {
    const route = await routeRepository.findById(payload.routeId);
    if (!route || (route.company_id && String(route.company_id) !== String(companyId))) {
      throw ApiError.badRequest('Rota associada não pertence a esta empresa.');
    }
  }
}

async function listPublicExpeditions(filters, pagination) {
  const { items, total } = await expeditionRepository.findPublic(filters, pagination);
  return {
    items,
    pagination: buildPaginationMeta({
      page: pagination.page,
      limit: pagination.limit,
      total
    })
  };
}

async function getPublicExpeditionByIdOrSlug(idOrSlug, currentUser = null) {
  const expedition = await expeditionRepository.findPublicDetailedByIdOrSlug(idOrSlug);
  if (!expedition) {
    throw ApiError.notFound('Expedição não encontrada.');
  }

  const heldSpots = await bookingRepository.countActiveWaitlistHolds(expedition.id);
  const availableSpots = Math.max(
    0,
    Number(expedition.max_capacity) - Number(expedition.reserved_spots) - Number(heldSpots)
  );

  let userWaitlistEntry = null;
  if (currentUser) {
    userWaitlistEntry = await bookingRepository.findActiveWaitlistEntry(
      expedition.id,
      currentUser.id
    );
  }

  let route = null;
  if (expedition.route_id) {
    route = await routeRepository.findDetailedById(expedition.route_id);
  }

  return {
    ...expedition,
    availableSpots,
    heldSpots: Number(heldSpots),
    userWaitlistEntry,
    route
  };
}

async function listCompanyExpeditions(companyId, filters, pagination) {
  const { items, total } = await expeditionRepository.findByCompany(companyId, filters, pagination);
  return {
    items,
    pagination: buildPaginationMeta({
      page: pagination.page,
      limit: pagination.limit,
      total
    })
  };
}

async function createCompanyExpedition(companyId, payload, actor, requestMeta = {}) {
  await validateCompanyReferences(companyId, payload);

  const minCap = Number(payload.minCapacity || 1);
  const maxCap = Number(payload.maxCapacity);
  if (maxCap < minCap) {
    throw ApiError.badRequest('A capacidade máxima não pode ser inferior à capacidade mínima.');
  }

  if (new Date(payload.endDate) < new Date(payload.startDate)) {
    throw ApiError.badRequest('A data de término deve ser igual ou posterior à data de início.');
  }

  const slug = generateUniqueSlug(payload.title);

  const expedition = await expeditionRepository.createExpedition({
    companyId,
    createdByUserId: actor.id,
    experienceId: payload.experienceId || null,
    destinationId: payload.destinationId,
    guideId: payload.guideId || null,
    transportId: payload.transportId || null,
    routeId: payload.routeId || null,
    title: payload.title,
    slug,
    description: payload.description,
    minCapacity: minCap,
    maxCapacity: maxCap,
    pricePerParticipant: Number(payload.pricePerParticipant),
    startDate: payload.startDate,
    endDate: payload.endDate,
    departureTime: payload.departureTime || null,
    meetingPoint: payload.meetingPoint || null,
    conditions: payload.conditions || null,
    cancellationPolicy: payload.cancellationPolicy || null,
    waitlistEnabled: payload.waitlistEnabled !== undefined ? Boolean(payload.waitlistEnabled) : true,
    status: payload.status || 'open',
    coverImageUrl: payload.coverImageUrl || null
  });

  await recordAuditLog({
    actorUserId: actor.id,
    companyId,
    action: 'expedition.create',
    entityType: 'expedition',
    entityId: expedition.id,
    ipAddress: requestMeta.ip,
    userAgent: requestMeta.userAgent,
    metadata: { title: expedition.title, maxCapacity: expedition.max_capacity }
  });

  return expedition;
}

async function updateCompanyExpedition(expeditionId, companyId, payload, actor, requestMeta = {}) {
  const existing = await expeditionRepository.findById(expeditionId);
  if (!existing || String(existing.company_id) !== String(companyId)) {
    throw ApiError.notFound('Expedição não encontrada para esta empresa.');
  }

  await validateCompanyReferences(companyId, payload);

  const nextMin =
    payload.minCapacity !== undefined ? Number(payload.minCapacity) : Number(existing.min_capacity);
  const nextMax =
    payload.maxCapacity !== undefined ? Number(payload.maxCapacity) : Number(existing.max_capacity);

  if (nextMax < nextMin) {
    throw ApiError.badRequest('A capacidade máxima não pode ser inferior à capacidade mínima.');
  }

  if (nextMax < Number(existing.reserved_spots)) {
    throw ApiError.conflict(
      `Não é possível reduzir a capacidade para ${nextMax} porque já existem ${existing.reserved_spots} vagas reservadas.`
    );
  }

  const updated = await expeditionRepository.updateExpedition(expeditionId, payload);

  if (
    payload.startDate ||
    payload.departureTime ||
    payload.meetingPoint ||
    (payload.status && payload.status !== existing.status)
  ) {
    const participantUserIds = await bookingRepository.findConfirmedUserIdsByExpedition(expeditionId);
    for (const userId of participantUserIds) {
      await notificationService.createNotification({
        userId,
        type: 'expedition_updated',
        title: 'Atualização na sua expedição',
        message: `A expedição "${updated.title}" teve alterações de agenda ou estado. Consulte os detalhes da sua reserva.`,
        referenceType: 'expedition',
        referenceId: updated.id
      });
    }
  }

  await recordAuditLog({
    actorUserId: actor.id,
    companyId,
    action: 'expedition.update',
    entityType: 'expedition',
    entityId: expeditionId,
    ipAddress: requestMeta.ip,
    userAgent: requestMeta.userAgent,
    metadata: { updatedFields: Object.keys(payload) }
  });

  return updated;
}

async function listExpeditionParticipants(expeditionId, companyId) {
  const existing = await expeditionRepository.findById(expeditionId);
  if (!existing || String(existing.company_id) !== String(companyId)) {
    throw ApiError.notFound('Expedição não encontrada para esta empresa.');
  }

  return bookingRepository.findParticipantsByExpedition(expeditionId);
}

module.exports = {
  listPublicExpeditions,
  getPublicExpeditionByIdOrSlug,
  listCompanyExpeditions,
  createCompanyExpedition,
  updateCompanyExpedition,
  listExpeditionParticipants
};