'use strict';

const { query } = require('../config/database');

function exec(client, text, params = []) {
  return client ? client.query(text, params) : query(text, params);
}

async function findById(routeId, client = null) {
  const result = await exec(
    client,
    `
    SELECT *
    FROM routes
    WHERE id = $1
    `,
    [routeId]
  );
  return result.rows[0] || null;
}

async function findDetailedById(routeId, client = null) {
  const routeResult = await exec(
    client,
    `
    SELECT
      r.*,
      c.name AS company_name,
      d.name AS destination_name,
      d.province AS destination_province,
      u.full_name AS created_by_name
    FROM routes r
    LEFT JOIN companies c ON c.id = r.company_id
    LEFT JOIN destinations d ON d.id = r.destination_id
    LEFT JOIN users u ON u.id = r.created_by_user_id
    WHERE r.id = $1
    `,
    [routeId]
  );

  const route = routeResult.rows[0];
  if (!route) {
    return null;
  }

  const [waypointsResult, itineraryResult] = await Promise.all([
    exec(
      client,
      `
      SELECT *
      FROM route_waypoints
      WHERE route_id = $1
      ORDER BY stop_order ASC, created_at ASC
      `,
      [routeId]
    ),
    exec(
      client,
      `
      SELECT *
      FROM route_itinerary_days
      WHERE route_id = $1
      ORDER BY day_number ASC
      `,
      [routeId]
    )
  ]);

  return {
    ...route,
    waypoints: waypointsResult.rows,
    itineraryDays: itineraryResult.rows
  };
}

async function findAccessible(filters = {}, pagination = { limit: 12, offset: 0 }) {
  const conditions = [];
  const params = [];

  if (filters.onlyPublic) {
    conditions.push('r.is_public = TRUE');
  } else {
    const accessBranches = ['r.is_public = TRUE'];
    if (filters.userId) {
      params.push(filters.userId);
      accessBranches.push(`r.created_by_user_id = $${params.length}`);
    }
    if (filters.companyId) {
      params.push(filters.companyId);
      accessBranches.push(`r.company_id = $${params.length}`);
    }
    conditions.push(`(${accessBranches.join(' OR ')})`);
  }

  if (filters.filterCompanyId) {
    params.push(filters.filterCompanyId);
    conditions.push(`r.company_id = $${params.length}`);
  }

  if (filters.destinationId) {
    params.push(filters.destinationId);
    conditions.push(`r.destination_id = $${params.length}`);
  }

  if (filters.search) {
    params.push(`%${filters.search}%`);
    conditions.push(`(r.title ILIKE $${params.length} OR r.description ILIKE $${params.length})`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await query(
    `SELECT COUNT(*)::INTEGER AS total FROM routes r ${whereClause}`,
    params
  );

  params.push(pagination.limit, pagination.offset);

  const listResult = await query(
    `
    SELECT
      r.*,
      c.name AS company_name,
      d.name AS destination_name,
      (SELECT COUNT(*)::INTEGER FROM route_waypoints rw WHERE rw.route_id = r.id) AS waypoints_count,
      (SELECT COUNT(*)::INTEGER FROM route_itinerary_days rid WHERE rid.route_id = r.id) AS days_count
    FROM routes r
    LEFT JOIN companies c ON c.id = r.company_id
    LEFT JOIN destinations d ON d.id = r.destination_id
    ${whereClause}
    ORDER BY r.created_at DESC
    LIMIT $${params.length - 1} OFFSET $${params.length}
    `,
    params
  );

  return {
    items: listResult.rows,
    total: countResult.rows[0].total
  };
}

async function createRoute(
  {
    companyId = null,
    createdByUserId,
    destinationId = null,
    title,
    slug,
    description = null,
    transportMode = 'driving',
    totalDistanceKm = 0,
    estimatedDurationMinutes = 0,
    routeGeoJson = null,
    isPublic = false
  },
  client = null
) {
  const result = await exec(
    client,
    `
    INSERT INTO routes (
      company_id,
      created_by_user_id,
      destination_id,
      title,
      slug,
      description,
      transport_mode,
      total_distance_km,
      estimated_duration_minutes,
      route_geojson,
      is_public
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11)
    RETURNING *
    `,
    [
      companyId,
      createdByUserId,
      destinationId,
      title,
      slug,
      description,
      transportMode,
      Number(totalDistanceKm || 0),
      Number(estimatedDurationMinutes || 0),
      JSON.stringify(routeGeoJson || null),
      Boolean(isPublic)
    ]
  );
  return result.rows[0];
}

async function updateRoute(routeId, payload, client = null) {
  const updates = [];
  const params = [routeId];

  const scalarMap = {
    title: 'title',
    description: 'description',
    destinationId: 'destination_id',
    transportMode: 'transport_mode',
    isPublic: 'is_public',
    totalDistanceKm: 'total_distance_km',
    estimatedDurationMinutes: 'estimated_duration_minutes'
  };

  for (const [key, col] of Object.entries(scalarMap)) {
    if (payload[key] !== undefined) {
      params.push(payload[key]);
      updates.push(`${col} = $${params.length}`);
    }
  }

  if (payload.routeGeoJson !== undefined) {
    params.push(JSON.stringify(payload.routeGeoJson));
    updates.push(`route_geojson = $${params.length}::jsonb`);
  }

  if (updates.length === 0) {
    return findById(routeId, client);
  }

  updates.push('updated_at = NOW()');

  const result = await exec(
    client,
    `
    UPDATE routes
    SET ${updates.join(', ')}
    WHERE id = $1
    RETURNING *
    `,
    params
  );
  return result.rows[0] || null;
}

async function replaceWaypoints(routeId, waypoints = [], client = null) {
  await exec(client, `DELETE FROM route_waypoints WHERE route_id = $1`, [routeId]);

  const inserted = [];
  for (const wp of waypoints) {
    const result = await exec(
      client,
      `
      INSERT INTO route_waypoints (
        route_id,
        title,
        description,
        waypoint_type,
        latitude,
        longitude,
        location,
        stop_order,
        estimated_minutes_at_stop,
        scheduled_time
      )
      VALUES (
        $1, $2, $3, $4, $5, $6,
        ST_SetSRID(ST_MakePoint($6, $5), 4326)::geography,
        $7, $8, $9
      )
      RETURNING *
      `,
      [
        routeId,
        wp.title,
        wp.description || null,
        wp.waypointType || 'poi',
        Number(wp.latitude),
        Number(wp.longitude),
        Number(wp.stopOrder),
        Number(wp.estimatedMinutesAtStop || 0),
        wp.scheduledTime || null
      ]
    );
    inserted.push(result.rows[0]);
  }
  return inserted;
}

async function replaceItineraryDays(routeId, days = [], client = null) {
  await exec(client, `DELETE FROM route_itinerary_days WHERE route_id = $1`, [routeId]);

  const inserted = [];
  for (const day of days) {
    const result = await exec(
      client,
      `
      INSERT INTO route_itinerary_days (
        route_id,
        day_number,
        title,
        summary,
        activities
      )
      VALUES ($1, $2, $3, $4, $5::jsonb)
      RETURNING *
      `,
      [
        routeId,
        Number(day.dayNumber),
        day.title,
        day.summary || null,
        JSON.stringify(day.activities || [])
      ]
    );
    inserted.push(result.rows[0]);
  }
  return inserted;
}

async function deleteRoute(routeId) {
  await query(`DELETE FROM routes WHERE id = $1`, [routeId]);
}

module.exports = {
  findById,
  findDetailedById,
  findAccessible,
  createRoute,
  updateRoute,
  replaceWaypoints,
  replaceItineraryDays,
  deleteRoute
};