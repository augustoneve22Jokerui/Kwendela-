'use strict';

const { withTransaction } = require('../config/database');
const ApiError = require('../utils/ApiError');
const { normalizeCoordinates } = require('../utils/geo');
const expeditionRepository = require('../repositories/expedition.repository');
const bookingRepository = require('../repositories/booking.repository');
const trackingRepository = require('../repositories/tracking.repository');

async function assertTrackingViewAccess(expeditionId, user) {
  const expedition = await expeditionRepository.findById(expeditionId);
  if (!expedition) {
    throw ApiError.notFound('Expedição não encontrada.');
  }

  if (user.role === 'superadmin') {
    return expedition;
  }

  const isCompanyMember =
    user.companyId && String(expedition.company_id) === String(user.companyId);

  if (isCompanyMember) {
    return expedition;
  }

  const hasBooking = await bookingRepository.hasConfirmedBookingForExpedition(
    expeditionId,
    user.id
  );

  if (!hasBooking) {
    throw ApiError.forbidden(
      'Apenas participantes confirmados ou membros da empresa organizadora podem aceder à localização desta expedição.'
    );
  }

  return expedition;
}

async function recordLivePosition({
  expeditionId,
  user,
  latitude,
  longitude,
  accuracyMeters = null,
  speedKmh = null,
  heading = null,
  consentGranted = false,
  recordedAt = null
}) {
  if (!consentGranted) {
    throw ApiError.forbidden(
      'Consentimento explícito obrigatório para partilhar a sua localização.',
      'LOCATION_CONSENT_REQUIRED'
    );
  }

  await assertTrackingViewAccess(expeditionId, user);

  const coords = normalizeCoordinates(latitude, longitude);
  if (!coords) {
    throw ApiError.badRequest('Coordenadas geográficas inválidas.');
  }

  const point = await withTransaction(async (client) => {
    await trackingRepository.upsertConsentState(
      {
        expeditionId,
        userId: user.id,
        isSharing: true
      },
      client
    );

    return trackingRepository.insertLocationPoint(
      {
        expeditionId,
        userId: user.id,
        latitude: coords.latitude,
        longitude: coords.longitude,
        accuracyMeters: accuracyMeters !== null ? Number(accuracyMeters) : null,
        speedKmh: speedKmh !== null ? Number(speedKmh) : null,
        heading: heading !== null ? Number(heading) : null,
        source: 'realtime',
        recordedAt: recordedAt ? new Date(recordedAt) : new Date()
      },
      client
    );
  });

  return {
    id: point.id,
    expeditionId: point.expedition_id,
    userId: point.user_id,
    userName: user.name,
    userRole: user.role,
    latitude: Number(point.latitude),
    longitude: Number(point.longitude),
    accuracyMeters: point.accuracy_meters !== null ? Number(point.accuracy_meters) : null,
    speedKmh: point.speed_kmh !== null ? Number(point.speed_kmh) : null,
    heading: point.heading !== null ? Number(point.heading) : null,
    recordedAt: point.recorded_at
  };
}

async function stopLiveSharing(expeditionId, user) {
  await assertTrackingViewAccess(expeditionId, user);
  await trackingRepository.upsertConsentState({
    expeditionId,
    userId: user.id,
    isSharing: false
  });
  return { sharingStopped: true };
}

async function syncOfflinePoints({ expeditionId, user, consentGranted, points = [] }) {
  if (!consentGranted) {
    throw ApiError.forbidden(
      'Consentimento explícito obrigatório para sincronizar localização.',
      'LOCATION_CONSENT_REQUIRED'
    );
  }

  await assertTrackingViewAccess(expeditionId, user);

  const validPoints = [];
  for (const pt of points) {
    const coords = normalizeCoordinates(pt.latitude, pt.longitude);
    if (!coords) {
      throw ApiError.badRequest('O lote contém coordenadas geográficas inválidas.');
    }
    validPoints.push({
      expeditionId,
      userId: user.id,
      latitude: coords.latitude,
      longitude: coords.longitude,
      accuracyMeters: pt.accuracyMeters !== null && pt.accuracyMeters !== undefined ? Number(pt.accuracyMeters) : null,
      speedKmh: pt.speedKmh !== null && pt.speedKmh !== undefined ? Number(pt.speedKmh) : null,
      heading: pt.heading !== null && pt.heading !== undefined ? Number(pt.heading) : null,
      source: 'offline_sync',
      recordedAt: pt.recordedAt ? new Date(pt.recordedAt) : new Date()
    });
  }

  validPoints.sort((a, b) => a.recordedAt - b.recordedAt);

  const insertedCount = await withTransaction(async (client) => {
    return trackingRepository.bulkInsertLocationPoints(validPoints, client);
  });

  return {
    expeditionId,
    syncedCount: insertedCount
  };
}

async function getExpeditionTrackingHistory(expeditionId, user, filters = {}) {
  const expedition = await assertTrackingViewAccess(expeditionId, user);

  const [latestPositions, historyPoints] = await Promise.all([
    trackingRepository.findLatestPositionsByExpedition(expeditionId),
    trackingRepository.findHistoryByExpedition(expeditionId, {
      userId: filters.userId || null,
      limit: Math.min(Number(filters.limit || 200), 1000)
    })
  ]);

  return {
    expedition: {
      id: expedition.id,
      title: expedition.title,
      status: expedition.status,
      startDate: expedition.start_date,
      endDate: expedition.end_date
    },
    latestPositions,
    historyPoints
  };
}

module.exports = {
  assertTrackingViewAccess,
  recordLivePosition,
  stopLiveSharing,
  syncOfflinePoints,
  getExpeditionTrackingHistory
};