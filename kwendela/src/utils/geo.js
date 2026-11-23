'use strict';

const EARTH_RADIUS_KM = 6371;

function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

function isValidLatitude(lat) {
  const num = Number(lat);
  return Number.isFinite(num) && num >= -90 && num <= 90;
}

function isValidLongitude(lng) {
  const num = Number(lng);
  return Number.isFinite(num) && num >= -180 && num <= 180;
}

function normalizeCoordinates(lat, lng) {
  const parsedLat = Number(lat);
  const parsedLng = Number(lng);

  if (!isValidLatitude(parsedLat) || !isValidLongitude(parsedLng)) {
    return null;
  }

  return {
    latitude: Number(parsedLat.toFixed(7)),
    longitude: Number(parsedLng.toFixed(7))
  };
}

function toWktPoint(lng, lat) {
  const coords = normalizeCoordinates(lat, lng);
  if (!coords) {
    return null;
  }
  return `POINT(${coords.longitude} ${coords.latitude})`;
}

function haversineDistanceKm(lat1, lng1, lat2, lng2) {
  const p1 = normalizeCoordinates(lat1, lng1);
  const p2 = normalizeCoordinates(lat2, lng2);
  if (!p1 || !p2) {
    return null;
  }

  const dLat = toRadians(p2.latitude - p1.latitude);
  const dLng = toRadians(p2.longitude - p1.longitude);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(p1.latitude)) *
      Math.cos(toRadians(p2.latitude)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((EARTH_RADIUS_KM * c).toFixed(3));
}

function calculateWaypointsDistanceKm(waypoints = []) {
  if (!Array.isArray(waypoints) || waypoints.length < 2) {
    return 0;
  }

  let totalKm = 0;
  for (let i = 1; i < waypoints.length; i += 1) {
    const prev = waypoints[i - 1];
    const curr = waypoints[i];
    const segment = haversineDistanceKm(
      prev.latitude,
      prev.longitude,
      curr.latitude,
      curr.longitude
    );
    if (segment !== null) {
      totalKm += segment;
    }
  }

  return Number(totalKm.toFixed(2));
}

function estimateDurationMinutes(distanceKm, averageSpeedKmh = 55) {
  const dist = Number(distanceKm);
  const speed = Number(averageSpeedKmh);
  if (!Number.isFinite(dist) || dist <= 0 || !Number.isFinite(speed) || speed <= 0) {
    return 0;
  }
  return Math.ceil((dist / speed) * 60);
}

module.exports = {
  isValidLatitude,
  isValidLongitude,
  normalizeCoordinates,
  toWktPoint,
  haversineDistanceKm,
  calculateWaypointsDistanceKm,
  estimateDurationMinutes
};