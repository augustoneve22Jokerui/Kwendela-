'use strict';

const ApiError = require('../utils/ApiError');
const { generateUniqueSlug } = require('../utils/slug');
const { buildPaginationMeta } = require('../utils/pagination');
const { removeUploadedFileByUrl } = require('../config/multer');
const { recordAuditLog } = require('../middlewares/audit.middleware');
const experienceRepository = require('../repositories/experience.repository');
const destinationRepository = require('../repositories/destination.repository');
const expeditionRepository = require('../repositories/expedition.repository');

async function listPublicExperiences(filters, pagination) {
  const { items, total } = await experienceRepository.findPublic(filters, pagination);
  return {
    items,
    pagination: buildPaginationMeta({
      page: pagination.page,
      limit: pagination.limit,
      total
    })
  };
}

async function getPublicExperienceByIdOrSlug(idOrSlug) {
  const experience = await experienceRepository.findPublicByIdOrSlug(idOrSlug);
  if (!experience) {
    throw ApiError.notFound('Experiência ou passeio não encontrado.');
  }

  const [media, upcomingExpeditions] = await Promise.all([
    experienceRepository.findMediaByExperienceId(experience.id),
    expeditionRepository.findUpcomingByExperienceId(experience.id)
  ]);

  return {
    ...experience,
    media,
    upcomingExpeditions
  };
}

async function listCompanyExperiences(companyId, filters, pagination) {
  const { items, total } = await experienceRepository.findByCompany(companyId, filters, pagination);
  return {
    items,
    pagination: buildPaginationMeta({
      page: pagination.page,
      limit: pagination.limit,
      total
    })
  };
}

async function createCompanyExperience(companyId, payload, actor, requestMeta = {}) {
  const destination = await destinationRepository.findById(payload.destinationId);
  if (
    !destination ||
    (destination.moderation_status !== 'approved' && String(destination.company_id) !== String(companyId))
  ) {
    throw ApiError.badRequest('Destino associado inválido ou não disponível.');
  }

  const slug = generateUniqueSlug(payload.title);
  const moderationStatus = actor.role === 'superadmin' ? 'approved' : 'pending_review';

  const experience = await experienceRepository.createExperience({
    companyId,
    destinationId: payload.destinationId,
    createdByUserId: actor.id,
    title: payload.title,
    slug,
    shortDescription: payload.shortDescription,
    description: payload.description,
    category: payload.category || 'culture',
    experienceType: payload.experienceType || 'experience',
    durationHours: Number(payload.durationHours),
    priceKz: Number(payload.priceKz),
    maxGroupSize: Number(payload.maxGroupSize || 15),
    difficultyLevel: payload.difficultyLevel || 'moderate',
    includes: payload.includes || [],
    excludes: payload.excludes || [],
    requirements: payload.requirements || [],
    meetingPoint: payload.meetingPoint || null,
    languages: payload.languages || ['Português'],
    coverImageUrl: payload.coverImageUrl || null,
    isActive: payload.isActive !== undefined ? Boolean(payload.isActive) : true,
    moderationStatus
  });

  await recordAuditLog({
    actorUserId: actor.id,
    companyId,
    action: 'experience.create',
    entityType: 'experience',
    entityId: experience.id,
    ipAddress: requestMeta.ip,
    userAgent: requestMeta.userAgent,
    metadata: { title: experience.title, experienceType: experience.experience_type }
  });

  return experience;
}

async function updateCompanyExperience(experienceId, companyId, payload, actor, requestMeta = {}) {
  const existing = await experienceRepository.findById(experienceId);
  if (!existing || String(existing.company_id) !== String(companyId)) {
    throw ApiError.notFound('Experiência não encontrada para esta empresa.');
  }

  if (payload.destinationId) {
    const destination = await destinationRepository.findById(payload.destinationId);
    if (
      !destination ||
      (destination.moderation_status !== 'approved' && String(destination.company_id) !== String(companyId))
    ) {
      throw ApiError.badRequest('Destino associado inválido.');
    }
  }

  const updated = await experienceRepository.updateExperience(experienceId, payload);

  await recordAuditLog({
    actorUserId: actor.id,
    companyId,
    action: 'experience.update',
    entityType: 'experience',
    entityId: experienceId,
    ipAddress: requestMeta.ip,
    userAgent: requestMeta.userAgent,
    metadata: { updatedFields: Object.keys(payload) }
  });

  return updated;
}

async function archiveCompanyExperience(experienceId, companyId, actor, requestMeta = {}) {
  const existing = await experienceRepository.findById(experienceId);
  if (!existing || String(existing.company_id) !== String(companyId)) {
    throw ApiError.notFound('Experiência não encontrada para esta empresa.');
  }

  await experienceRepository.archiveExperience(experienceId);

  await recordAuditLog({
    actorUserId: actor.id,
    companyId,
    action: 'experience.archive',
    entityType: 'experience',
    entityId: experienceId,
    ipAddress: requestMeta.ip,
    userAgent: requestMeta.userAgent
  });

  return { archived: true };
}

async function addExperienceMedia(experienceId, companyId, mediaPayload, actor) {
  const existing = await experienceRepository.findById(experienceId);
  if (!existing || String(existing.company_id) !== String(companyId)) {
    throw ApiError.notFound('Experiência não encontrada para esta empresa.');
  }

  if (!mediaPayload.url) {
    throw ApiError.badRequest('URL ou ficheiro multimédia obrigatório.');
  }

  const media = await experienceRepository.addMedia(experienceId, {
    mediaType: mediaPayload.mediaType || 'image',
    url: mediaPayload.url,
    caption: mediaPayload.caption || null,
    isCover: Boolean(mediaPayload.isCover),
    displayOrder: Number(mediaPayload.displayOrder || 0),
    uploadedByUserId: actor.id
  });

  if (mediaPayload.isCover && mediaPayload.mediaType !== 'video') {
    await experienceRepository.updateExperience(experienceId, {
      coverImageUrl: mediaPayload.url
    });
  }

  return media;
}

async function removeExperienceMedia(experienceId, mediaId, companyId) {
  const existing = await experienceRepository.findById(experienceId);
  if (!existing || String(existing.company_id) !== String(companyId)) {
    throw ApiError.notFound('Experiência não encontrada para esta empresa.');
  }

  const deleted = await experienceRepository.removeMedia(experienceId, mediaId);
  if (!deleted) {
    throw ApiError.notFound('Item multimédia não encontrado.');
  }

  if (deleted.url && deleted.url.startsWith('/uploads/')) {
    removeUploadedFileByUrl(deleted.url);
  }

  return { deleted: true };
}

module.exports = {
  listPublicExperiences,
  getPublicExperienceByIdOrSlug,
  listCompanyExperiences,
  createCompanyExperience,
  updateCompanyExperience,
  archiveCompanyExperience,
  addExperienceMedia,
  removeExperienceMedia
};