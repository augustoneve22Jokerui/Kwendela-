'use strict';

const ApiError = require('../utils/ApiError');
const { generateUniqueSlug } = require('../utils/slug');
const { normalizeCoordinates } = require('../utils/geo');
const { buildPaginationMeta } = require('../utils/pagination');
const { removeUploadedFileByUrl } = require('../config/multer');
const { recordAuditLog } = require('../middlewares/audit.middleware');
const destinationRepository = require('../repositories/destination.repository');

async function listPublicDestinations(filters, pagination) {
  const { items, total } = await destinationRepository.findPublic(filters, pagination);
  return {
    items,
    pagination: buildPaginationMeta({
      page: pagination.page,
      limit: pagination.limit,
      total
    })
  };
}

async function listProvinces() {
  return destinationRepository.findAvailableProvinces();
}

async function getPublicDestinationByIdOrSlug(idOrSlug, currentUser = null) {
  const destination = await destinationRepository.findPublicByIdOrSlug(idOrSlug);
  if (!destination) {
    throw ApiError.notFound('Destino turístico não encontrado.');
  }

  await destinationRepository.incrementViewsCount(destination.id);

  const [media, isFavorite] = await Promise.all([
    destinationRepository.findMediaByDestinationId(destination.id),
    currentUser ? destinationRepository.isFavoritedByUser(destination.id, currentUser.id) : false
  ]);

  return {
    ...destination,
    media,
    isFavorite: Boolean(isFavorite)
  };
}

async function listCompanyDestinations(companyId, filters, pagination) {
  const { items, total } = await destinationRepository.findByCompany(companyId, filters, pagination);
  return {
    items,
    pagination: buildPaginationMeta({
      page: pagination.page,
      limit: pagination.limit,
      total
    })
  };
}

async function createCompanyDestination(companyId, payload, actor, requestMeta = {}) {
  const coords = normalizeCoordinates(payload.latitude, payload.longitude);
  if (!coords) {
    throw ApiError.badRequest('Coordenadas geográficas inválidas para o destino.');
  }

  const slug = generateUniqueSlug(payload.name);
  const moderationStatus = actor.role === 'superadmin' ? 'approved' : 'pending_review';

  const destination = await destinationRepository.createDestination({
    companyId,
    createdByUserId: actor.id,
    name: payload.name,
    slug,
    country: payload.country || 'Angola',
    province: payload.province,
    municipality: payload.municipality || null,
    category: payload.category || 'nature',
    shortDescription: payload.shortDescription,
    description: payload.description,
    latitude: coords.latitude,
    longitude: coords.longitude,
    bestSeason: payload.bestSeason || null,
    highlights: payload.highlights || [],
    practicalInfo: payload.practicalInfo || {},
    coverImageUrl: payload.coverImageUrl || null,
    moderationStatus
  });

  await recordAuditLog({
    actorUserId: actor.id,
    companyId,
    action: 'destination.create',
    entityType: 'destination',
    entityId: destination.id,
    ipAddress: requestMeta.ip,
    userAgent: requestMeta.userAgent,
    metadata: { name: destination.name, province: destination.province }
  });

  return destination;
}

async function updateCompanyDestination(destinationId, companyId, payload, actor, requestMeta = {}) {
  const existing = await destinationRepository.findById(destinationId);
  if (!existing || String(existing.company_id) !== String(companyId)) {
    throw ApiError.notFound('Destino não encontrado para esta empresa.');
  }

  const updateData = { ...payload };
  if (payload.latitude !== undefined || payload.longitude !== undefined) {
    const lat = payload.latitude !== undefined ? payload.latitude : existing.latitude;
    const lng = payload.longitude !== undefined ? payload.longitude : existing.longitude;
    const coords = normalizeCoordinates(lat, lng);
    if (!coords) {
      throw ApiError.badRequest('Coordenadas geográficas inválidas.');
    }
    updateData.latitude = coords.latitude;
    updateData.longitude = coords.longitude;
  }

  const updated = await destinationRepository.updateDestination(destinationId, updateData);

  await recordAuditLog({
    actorUserId: actor.id,
    companyId,
    action: 'destination.update',
    entityType: 'destination',
    entityId: destinationId,
    ipAddress: requestMeta.ip,
    userAgent: requestMeta.userAgent,
    metadata: { updatedFields: Object.keys(payload) }
  });

  return updated;
}

async function deleteCompanyDestination(destinationId, companyId, actor, requestMeta = {}) {
  const existing = await destinationRepository.findById(destinationId);
  if (!existing || String(existing.company_id) !== String(companyId)) {
    throw ApiError.notFound('Destino não encontrado para esta empresa.');
  }

  await destinationRepository.archiveDestination(destinationId);

  await recordAuditLog({
    actorUserId: actor.id,
    companyId,
    action: 'destination.archive',
    entityType: 'destination',
    entityId: destinationId,
    ipAddress: requestMeta.ip,
    userAgent: requestMeta.userAgent
  });

  return { archived: true };
}

async function addDestinationMedia(destinationId, companyId, mediaPayload, actor) {
  const existing = await destinationRepository.findById(destinationId);
  if (!existing || String(existing.company_id) !== String(companyId)) {
    throw ApiError.notFound('Destino não encontrado para esta empresa.');
  }

  if (!mediaPayload.url) {
    throw ApiError.badRequest('URL ou ficheiro multimédia obrigatório.');
  }

  const media = await destinationRepository.addMedia(destinationId, {
    mediaType: mediaPayload.mediaType || 'image',
    url: mediaPayload.url,
    caption: mediaPayload.caption || null,
    isCover: Boolean(mediaPayload.isCover),
    displayOrder: Number(mediaPayload.displayOrder || 0),
    uploadedByUserId: actor.id
  });

  if (mediaPayload.isCover && mediaPayload.mediaType !== 'video') {
    await destinationRepository.updateDestination(destinationId, {
      coverImageUrl: mediaPayload.url
    });
  }

  return media;
}

async function removeDestinationMedia(destinationId, mediaId, companyId) {
  const existing = await destinationRepository.findById(destinationId);
  if (!existing || String(existing.company_id) !== String(companyId)) {
    throw ApiError.notFound('Destino não encontrado para esta empresa.');
  }

  const deleted = await destinationRepository.removeMedia(destinationId, mediaId);
  if (!deleted) {
    throw ApiError.notFound('Item multimédia não encontrado.');
  }

  if (deleted.url && deleted.url.startsWith('/uploads/')) {
    removeUploadedFileByUrl(deleted.url);
  }

  return { deleted: true };
}

async function toggleFavorite(destinationId, userId) {
  const destination = await destinationRepository.findPublicByIdOrSlug(destinationId);
  if (!destination) {
    throw ApiError.notFound('Destino não encontrado.');
  }

  const isCurrentlyFavorite = await destinationRepository.isFavoritedByUser(destination.id, userId);
  if (isCurrentlyFavorite) {
    await destinationRepository.removeFavorite(destination.id, userId);
    return { isFavorite: false, destinationId: destination.id };
  }

  await destinationRepository.addFavorite(destination.id, userId);
  return { isFavorite: true, destinationId: destination.id };
}

module.exports = {
  listPublicDestinations,
  listProvinces,
  getPublicDestinationByIdOrSlug,
  listCompanyDestinations,
  createCompanyDestination,
  updateCompanyDestination,
  deleteCompanyDestination,
  addDestinationMedia,
  removeDestinationMedia,
  toggleFavorite
};