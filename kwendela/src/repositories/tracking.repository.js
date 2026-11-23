'use strict';

const { query } = require('../config/database');

function exec(client, text, params = []) {
  return client ? client.query(text, params) : query(text, params);
}

async function upsertConsentState({ expeditionId, userId, isSharing }, client = null) {
  const result = await exec(
    client,
    `
    INSERT INTO expedition_tracking_consents (
      expedition_id,
      user_id,
      is_sharing,
      consented_at,
      stopped_at
    )
    VALUES (
      $1,
      $2,
      $3,
      CASE WHEN $3 = TRUE THEN NOW() ELSE NULL END,
      CASE WHEN $3 = FALSE THEN NOW() ELSE NULL END
    )
    ON CONFLICT (expedition_id, user_id) DO UPDATE
    SET is_sharing = EXCLUDED.is_sharing,
        consented_at = CASE
          WHEN EXCLUDED.is_sharing = TRUE THEN COALESCE(expedition_tracking_consents.consented_at, NOW())
          ELSE expedition_tracking_consents.consented_at
        END,
        stopped_at = CASE
          WHEN EXCLUDED.is_sharing = FALSE THEN NOW()
          ELSE NULL
        END,
        updated_at = NOW()
    RETURNING *
    `,
    [expeditionId, userId, Boolean(isSharing)]
  );
  return result.rows[0];
}

async function insertLocationPoint(
  {
    expeditionId,
    userId,
    latitude,
    longitude,
    accuracyMeters = null,
    speedKmh = null,
    heading = null,
    source = 'realtime',
    recordedAt = new Date()
  },
  client = null
) {
  const result = await exec(
    client,
    `
    INSERT INTO expedition_location_points (
      expedition_id,
      user_id,
      latitude,
      longitude,
      location,
      accuracy_meters,
      speed_kmh,
      heading,
      source,
      recorded_at
    )
    VALUES (
      $1,
      $2,
      $3,
      $4,
      ST_SetSRID(ST_MakePoint($4, $3), 4326)::geography,
      $5,
      $6,
      $7,
      $8,
      $9
    )
    RETURNING *
    `,
    [
      expeditionId,
      userId,
      Number(latitude),
      Number(longitude),
      accuracyMeters,
      speedKmh,
      heading,
      source,
      recordedAt
    ]
  );
  return result.rows[0];
}

async function bulkInsertLocationPoints(points = [], client = null) {
  let insertedCount = 0;
  for (const pt of points) {
    await insertLocationPoint(pt, client);
    insertedCount += 1;
  }
  return insertedCount;
}

async function findLatestPositionsByExpedition(expeditionId) {
  const result = await query(
    `
    SELECT DISTINCT ON (elp.user_id)
      elp.id,
      elp.expedition_id,
      elp.user_id,
      u.full_name AS user_name,
      u.role AS user_role,
      elp.latitude,
      elp.longitude,
      elp.accuracy_meters,
      elp.speed_kmh,
      elp.heading,
      elp.source,
      elp.recorded_at,
      etc.is_sharing
    FROM expedition_location_points elp
    INNER JOIN users u ON u.id = elp.user_id
    INNER JOIN expedition_tracking_consents etc
      ON etc.expedition_id = elp.expedition_id AND etc.user_id = elp.user_id
    WHERE elp.expedition_id = $1
      AND etc.is_sharing = TRUE
    ORDER BY elp.user_id, elp.recorded_at DESC
    `,
    [expeditionId]
  );
  return result.rows;
}

async function findHistoryByExpedition(expeditionId, { userId = null, limit = 200 } = {}) {
  const conditions = ['elp.expedition_id = $1'];
  const params = [expeditionId];

  if (userId) {
    params.push(userId);
    conditions.push(`elp.user_id = $${params.length}`);
  }

  params.push(Math.min(Number(limit || 200), 1000));

  const result = await query(
    `
    SELECT
      elp.id,
      elp.expedition_id,
      elp.user_id,
      u.full_name AS user_name,
      elp.latitude,
      elp.longitude,
      elp.accuracy_meters,
      elp.speed_kmh,
      elp.heading,
      elp.source,
      elp.recorded_at
    FROM expedition_location_points elp
    INNER JOIN users u ON u.id = elp.user_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY elp.recorded_at DESC
    LIMIT $${params.length}
    `,
    params
  );
  return result.rows;
}

module.exports = {
  upsertConsentState,
  insertLocationPoint,
  bulkInsertLocationPoints,
  findLatestPositionsByExpedition,
  findHistoryByExpedition
};