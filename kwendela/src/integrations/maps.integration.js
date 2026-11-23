'use strict';

const env = require('../config/env');
const logger = require('../config/logger');

const REQUEST_TIMEOUT_MS = 6000;

function hasValidMapboxToken() {
  return Boolean(
    env.maps.mapboxToken &&
      !env.maps.mapboxToken.startsWith('substituir_') &&
      !env.isTest
  );
}

function hasValidGoogleKey() {
  return Boolean(
    env.maps.googleApiKey &&
      !env.maps.googleApiKey.startsWith('substituir_') &&
      !env.isTest
  );
}

function mapModeToMapboxProfile(transportMode) {
  switch (transportMode) {
    case 'walking':
      return 'walking';
    case 'driving':
    case '4x4':
    case 'mixed':
    default:
      return 'driving';
  }
}

function mapModeToGoogleMode(transportMode) {
  switch (transportMode) {
    case 'walking':
      return 'walking';
    case 'driving':
    case '4x4':
    case 'mixed':
    default:
      return 'driving';
  }
}

function decodeGooglePolyline(encoded) {
  const coordinates = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let b;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    coordinates.push([Number((lng / 1e5).toFixed(6)), Number((lat / 1e5).toFixed(6))]);
  }

  return coordinates;
}

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function calculateWithMapbox(waypoints, transportMode) {
  if (!hasValidMapboxToken() || waypoints.length < 2 || waypoints.length > 25) {
    return null;
  }

  if (transportMode === 'boat') {
    return null;
  }

  const profile = mapModeToMapboxProfile(transportMode);
  const coordsParam = waypoints
    .map((wp) => `${Number(wp.longitude)},${Number(wp.latitude)}`)
    .join(';');

  const url =
    `https://api.mapbox.com/directions/v5/mapbox/${profile}/${coordsParam}` +
    `?geometries=geojson&overview=full&access_token=${encodeURIComponent(env.maps.mapboxToken)}`;

  const data = await fetchWithTimeout(url);
  if (!data || !Array.isArray(data.routes) || data.routes.length === 0) {
    return null;
  }

  const primaryRoute = data.routes[0];
  const stopMinutes = waypoints.reduce(
    (acc, wp) => acc + Number(wp.estimatedMinutesAtStop || 0),
    0
  );

  return {
    provider: 'mapbox',
    distanceKm: Number((Number(primaryRoute.distance || 0) / 1000).toFixed(2)),
    durationMinutes: Math.ceil(Number(primaryRoute.duration || 0) / 60) + stopMinutes,
    geometry: primaryRoute.geometry || {
      type: 'LineString',
      coordinates: waypoints.map((wp) => [Number(wp.longitude), Number(wp.latitude)])
    }
  };
}

async function calculateWithGoogle(waypoints, transportMode) {
  if (!hasValidGoogleKey() || waypoints.length < 2 || waypoints.length > 25) {
    return null;
  }

  if (transportMode === 'boat') {
    return null;
  }

  const origin = `${Number(waypoints[0].latitude)},${Number(waypoints[0].longitude)}`;
  const destination = `${Number(waypoints[waypoints.length - 1].latitude)},${Number(waypoints[waypoints.length - 1].longitude)}`;
  const intermediate = waypoints.slice(1, -1);

  const params = new URLSearchParams({
    origin,
    destination,
    mode: mapModeToGoogleMode(transportMode),
    key: env.maps.googleApiKey
  });

  if (intermediate.length > 0) {
    params.set(
      'waypoints',
      intermediate.map((wp) => `${Number(wp.latitude)},${Number(wp.longitude)}`).join('|')
    );
  }

  const url = `https://maps.googleapis.com/maps/api/directions/json?${params.toString()}`;
  const data = await fetchWithTimeout(url);

  if (!data || data.status !== 'OK' || !Array.isArray(data.routes) || data.routes.length === 0) {
    return null;
  }

  const route = data.routes[0];
  const legs = Array.isArray(route.legs) ? route.legs : [];
  const totalMeters = legs.reduce((sum, leg) => sum + Number(leg.distance?.value || 0), 0);
  const totalSeconds = legs.reduce((sum, leg) => sum + Number(leg.duration?.value || 0), 0);
  const stopMinutes = waypoints.reduce(
    (acc, wp) => acc + Number(wp.estimatedMinutesAtStop || 0),
    0
  );

  const decodedCoords =
    route.overview_polyline && route.overview_polyline.points
      ? decodeGooglePolyline(route.overview_polyline.points)
      : waypoints.map((wp) => [Number(wp.longitude), Number(wp.latitude)]);

  return {
    provider: 'google',
    distanceKm: Number((totalMeters / 1000).toFixed(2)),
    durationMinutes: Math.ceil(totalSeconds / 60) + stopMinutes,
    geometry: {
      type: 'LineString',
      coordinates: decodedCoords
    }
  };
}

async function calculateRoute(waypoints = [], transportMode = 'driving') {
  if (!Array.isArray(waypoints) || waypoints.length < 2) {
    return null;
  }

  try {
    if (env.maps.provider === 'google' && hasValidGoogleKey()) {
      return await calculateWithGoogle(waypoints, transportMode);
    }

    if (hasValidMapboxToken()) {
      return await calculateWithMapbox(waypoints, transportMode);
    }

    if (hasValidGoogleKey()) {
      return await calculateWithGoogle(waypoints, transportMode);
    }

    return null;
  } catch (err) {
    logger.warn('Falha ao calcular rota via provedor externo de mapas; a utilizar fallback geodésico', {
      provider: env.maps.provider,
      reason: err.message
    });
    return null;
  }
}

function getActiveProviderStatus() {
  return {
    provider: env.maps.provider,
    mapboxEnabled: hasValidMapboxToken(),
    googleEnabled: hasValidGoogleKey()
  };
}

module.exports = {
  calculateRoute,
  getActiveProviderStatus
};