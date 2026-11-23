'use strict';

const { withTransaction } = require('../config/database');
const ApiError = require('../utils/ApiError');
const { generateUniqueSlug } = require('../utils/slug');
const {
  normalizeCoordinates,
  calculateWaypointsDistanceKm,
  estimateDurationMinutes
} = require('../utils/geo');
const { buildPaginationMeta } = require('../utils/pagination');
const { recordAuditLog } = require('../middlewares/audit.middleware');
const mapsIntegration = require('../integrations/maps.integration');
const routeRepository = require('../repositories/route.repository');

function assertRouteModifyAccess(route, user) {
  if (!route) {
    throw ApiError.notFound('Rota não encontrada.');
  }
  if (user.role === 'superadmin') {
    return;
  }
  const isCreator = String(route.created_by_user_id) === String(user.id);
  const isCompanyMember =
    route.company_id && user.companyId && String(route.company_id) === String(user.companyId);

  if (!isCreator && !isCompanyMember) {
    throw ApiError.forbidden('Não tem permissão para modificar esta rota.');
  }
}

async function computeRouteMetrics(waypoints, transportMode = 'driving') {
  const normalizedWaypoints = waypoints.map((wp, index) => {
    const coords = normalizeCoordinates(wp.latitude, wp.longitude);
    if (!coords) {
      throw ApiError.badRequest(`Coordenadas inválidas no ponto de paragem #${index + 1}.`);
    }
    return {
      ...wp,
      latitude: coords.latitude,
      longitude: coords.longitude
    };
  });

  const ordered = [...normalizedWaypoints].sort((a, b) => a.stopOrder - b.stopOrder);

  const externalRoute = await mapsIntegration.calculateRoute(ordered, transportMode);
  if (externalRoute) {
    return {
      orderedWaypoints: ordered,
      totalDistanceKm: externalRoute.distanceKm,
      estimatedDurationMinutes: externalRoute.durationMinutes,
      routeGeoJson: externalRoute.geometry
    };
  }

  const distanceKm = calculateWaypointsDistanceKm(ordered);
  const speedMap = {
    walking: 5,
    boat: 25,
    '4x4': 45,
    driving: 60,
    mixed: 45
  };
  const travelMinutes = estimateDurationMinutes(distanceKm, speedMap[transportMode] || 55);
  const stopMinutes = ordered.reduce(
    (acc, wp) => acc + Number(wp.estimatedMinutesAtStop || 0),
    0
  );

  const fallbackGeoJson = {
    type: 'LineString',
    coordinates: ordered.map((wp) => [wp.longitude, wp.latitude])
  };

  return {
    orderedWaypoints: ordered,
    totalDistanceKm: distanceKm,
    estimatedDurationMinutes: travelMinutes + stopMinutes,
    routeGeoJson: fallbackGeoJson
  };
}

async function listRoutes(filters, pagination, currentUser = null) {
  const effectiveFilters = {
    ...filters,
    userId: currentUser ? currentUser.id : null,
    companyId: filters.companyId || (currentUser && currentUser.companyId) || null
  };

  const { items, total } = await routeRepository.findAccessible(effectiveFilters, pagination);
  return {
    items,
    pagination: buildPaginationMeta({
      page: pagination.page,
      limit: pagination.limit,
      total
    })
  };
}

async function getRouteById(routeId, currentUser = null) {
  const route = await routeRepository.findDetailedById(routeId);
  if (!route) {
    throw ApiError.notFound('Rota não encontrada.');
  }

  if (!route.is_public) {
    if (!currentUser) {
      throw ApiError.unauthorized('Autenticação necessária para visualizar esta rota.');
    }
    assertRouteModifyAccess(route, currentUser);
  }

  return route;
}

async function createRoute(payload, user, requestMeta = {}) {
  const { orderedWaypoints, totalDistanceKm, estimatedDurationMinutes, routeGeoJson } =
    await computeRouteMetrics(payload.waypoints, payload.transportMode);

  const slug = generateUniqueSlug(payload.title);
  const companyId = user.companyId || null;

  const created = await withTransaction(async (client) => {
    const route = await routeRepository.createRoute(
      {
        companyId,
        createdByUserId: user.id,
        destinationId: payload.destinationId || null,
        title: payload.title,
        slug,
        description: payload.description || null,
        transportMode: payload.transportMode || 'driving',
        totalDistanceKm,
        estimatedDurationMinutes,
        routeGeoJson,
        isPublic: Boolean(payload.isPublic)
      },
      client
    );

    await routeRepository.replaceWaypoints(route.id, orderedWaypoints, client);

    if (Array.isArray(payload.itineraryDays) && payload.itineraryDays.length > 0) {
      await routeRepository.replaceItineraryDays(route.id, payload.itineraryDays, client);
    }

    return routeRepository.findDetailedById(route.id, client);
  });

  await recordAuditLog({
    actorUserId: user.id,
    companyId,
    action: 'route.create',
    entityType: 'route',
    entityId: created.id,
    ipAddress: requestMeta.ip,
    userAgent: requestMeta.userAgent,
    metadata: { title: created.title, totalDistanceKm }
  });

  return created;
}

async function updateRoute(routeId, payload, user, requestMeta = {}) {
  const existing = await routeRepository.findDetailedById(routeId);
  assertRouteModifyAccess(existing, user);

  const updated = await withTransaction(async (client) => {
    let metrics = null;
    if (Array.isArray(payload.waypoints)) {
      metrics = await computeRouteMetrics(
        payload.waypoints,
        payload.transportMode || existing.transport_mode
      );
      await routeRepository.replaceWaypoints(routeId, metrics.orderedWaypoints, client);
    }

    if (Array.isArray(payload.itineraryDays)) {
      await routeRepository.replaceItineraryDays(routeId, payload.itineraryDays, client);
    }

    await routeRepository.updateRoute(
      routeId,
      {
        title: payload.title,
        description: payload.description,
        destinationId: payload.destinationId,
        transportMode: payload.transportMode,
        isPublic: payload.isPublic,
        totalDistanceKm: metrics ? metrics.totalDistanceKm : undefined,
        estimatedDurationMinutes: metrics ? metrics.estimatedDurationMinutes : undefined,
        routeGeoJson: metrics ? metrics.routeGeoJson : undefined
      },
      client
    );

    return routeRepository.findDetailedById(routeId, client);
  });

  await recordAuditLog({
    actorUserId: user.id,
    companyId: existing.company_id || null,
    action: 'route.update',
    entityType: 'route',
    entityId: routeId,
    ipAddress: requestMeta.ip,
    userAgent: requestMeta.userAgent
  });

  return updated;
}

async function addWaypoint(routeId, waypointPayload, user) {
  const existing = await routeRepository.findDetailedById(routeId);
  assertRouteModifyAccess(existing, user);

  const combinedWaypoints = [
    ...(existing.waypoints || []).map((wp) => ({
      title: wp.title,
      description: wp.description,
      waypointType: wp.waypoint_type,
      latitude: Number(wp.latitude),
      longitude: Number(wp.longitude),
      stopOrder: wp.stop_order,
      estimatedMinutesAtStop: wp.estimated_minutes_at_stop,
      scheduledTime: wp.scheduled_time
    })),
    waypointPayload
  ];

  const metrics = await computeRouteMetrics(combinedWaypoints, existing.transport_mode);

  return withTransaction(async (client) => {
    await routeRepository.replaceWaypoints(routeId, metrics.orderedWaypoints, client);
    await routeRepository.updateRoute(
      routeId,
      {
        totalDistanceKm: metrics.totalDistanceKm,
        estimatedDurationMinutes: metrics.estimatedDurationMinutes,
        routeGeoJson: metrics.routeGeoJson
      },
      client
    );

    return routeRepository.findDetailedById(routeId, client);
  });
}

async function deleteRoute(routeId, user) {
  const existing = await routeRepository.findById(routeId);
  assertRouteModifyAccess(existing, user);
  await routeRepository.deleteRoute(routeId);
  return { deleted: true };
}

module.exports = {
  listRoutes,
  getRouteById,
  createRoute,
  updateRoute,
  addWaypoint,
  deleteRoute
};