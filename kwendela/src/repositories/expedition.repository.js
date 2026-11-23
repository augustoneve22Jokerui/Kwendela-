'use strict';

const { query } = require('../config/database');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ALLOWED_SORT_COLUMNS = {
  start_date: 'ex.start_date',
  price_per_participant: 'ex.price_per_participant',
  created_at: 'ex.created_at',
  max_capacity: 'ex.max_capacity'
};

function exec(client, text, params = []) {
  return client ? client.query(text, params) : query(text, params);
}

async function findById(expeditionId, client = null) {
  const result = await exec(
    client,
    `
    SELECT *
    FROM expeditions
    WHERE id = $1
    `,
    [expeditionId]
  );
  return result.rows[0] || null;
}

async function findByIdForUpdate(expeditionId, client) {
  const result = await client.query(
    `
    SELECT *
    FROM expeditions
    WHERE id = $1
    FOR UPDATE
    `,
    [expeditionId]
  );
  return result.rows[0] || null;
}

async function updateReservedSpots(expeditionId, { reservedSpots, status }, client = null) {
  const result = await exec(
    client,
    `
    UPDATE expeditions
    SET reserved_spots = $2,
        status = $3,
        updated_at = NOW()
    WHERE id = $1
    RETURNING *
    `,
    [expeditionId, Number(reservedSpots), status]
  );
  return result.rows[0] || null;
}

async function findPublic(
  filters = {},
  pagination = { limit: 12, offset: 0, sortBy: 'start_date', sortOrder: 'ASC' }
) {
  const conditions = [`c.status = 'active'`];
  const params = [];

  if (filters.status) {
    params.push(filters.status);
    conditions.push(`ex.status = $${params.length}`);
  } else {
    conditions.push(`ex.status IN ('published', 'open', 'full')`);
  }

  if (filters.destinationId) {
    params.push(filters.destinationId);
    conditions.push(`ex.destination_id = $${params.length}`);
  }

  if (filters.companyId) {
    params.push(filters.companyId);
    conditions.push(`ex.company_id = $${params.length}`);
  }

  if (filters.startDateFrom) {
    params.push(filters.startDateFrom);
    conditions.push(`ex.start_date >= $${params.length}`);
  }

  if (filters.startDateTo) {
    params.push(filters.startDateTo);
    conditions.push(`ex.start_date <= $${params.length}`);
  }

  if (filters.minPrice !== undefined && filters.minPrice !== '') {
    params.push(Number(filters.minPrice));
    conditions.push(`ex.price_per_participant >= $${params.length}`);
  }

  if (filters.maxPrice !== undefined && filters.maxPrice !== '') {
    params.push(Number(filters.maxPrice));
    conditions.push(`ex.price_per_participant <= $${params.length}`);
  }

  if (filters.hasAvailability === true || String(filters.hasAvailability) === 'true') {
    conditions.push(`(ex.max_capacity - ex.reserved_spots) > 0 AND ex.status IN ('published', 'open')`);
  }

  if (filters.search) {
    params.push(`%${filters.search}%`);
    conditions.push(
      `(ex.title ILIKE $${params.length} OR d.name ILIKE $${params.length} OR d.province ILIKE $${params.length})`
    );
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;
  const sortCol = ALLOWED_SORT_COLUMNS[pagination.sortBy] || 'ex.start_date';
  const sortOrder = String(pagination.sortOrder).toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

  const countResult = await query(
    `
    SELECT COUNT(*)::INTEGER AS total
    FROM expeditions ex
    INNER JOIN companies c ON c.id = ex.company_id
    LEFT JOIN destinations d ON d.id = ex.destination_id
    ${whereClause}
    `,
    params
  );

  params.push(pagination.limit, pagination.offset);

  const listResult = await query(
    `
    SELECT
      ex.*,
      GREATEST(0, ex.max_capacity - ex.reserved_spots)::INTEGER AS available_spots,
      c.name AS company_name,
      c.is_verified AS company_verified,
      d.name AS destination_name,
      d.province AS destination_province,
      d.cover_image_url AS destination_cover_image_url,
      exp.title AS experience_title
    FROM expeditions ex
    INNER JOIN companies c ON c.id = ex.company_id
    LEFT JOIN destinations d ON d.id = ex.destination_id
    LEFT JOIN experiences exp ON exp.id = ex.experience_id
    ${whereClause}
    ORDER BY ${sortCol} ${sortOrder}
    LIMIT $${params.length - 1} OFFSET $${params.length}
    `,
    params
  );

  return {
    items: listResult.rows,
    total: countResult.rows[0].total
  };
}

async function findPublicDetailedByIdOrSlug(idOrSlug) {
  const isUuid = UUID_REGEX.test(String(idOrSlug));
  const lookupCondition = isUuid ? 'ex.id = $1' : 'ex.slug = $1';

  const result = await query(
    `
    SELECT
      ex.*,
      c.name AS company_name,
      c.slug AS company_slug,
      c.is_verified AS company_verified,
      d.name AS destination_name,
      d.slug AS destination_slug,
      d.province AS destination_province,
      d.cover_image_url AS destination_cover_image_url,
      exp.title AS experience_title,
      exp.slug AS experience_slug,
      g.full_name AS guide_name,
      g.languages AS guide_languages,
      t.name AS transport_name,
      t.vehicle_type AS transport_type,
      t.capacity AS transport_capacity
    FROM expeditions ex
    INNER JOIN companies c ON c.id = ex.company_id
    LEFT JOIN destinations d ON d.id = ex.destination_id
    LEFT JOIN experiences exp ON exp.id = ex.experience_id
    LEFT JOIN guides g ON g.id = ex.guide_id
    LEFT JOIN transports t ON t.id = ex.transport_id
    WHERE ${lookupCondition}
      AND ex.status <> 'draft'
    LIMIT 1
    `,
    [idOrSlug]
  );

  return result.rows[0] || null;
}

async function findUpcomingByExperienceId(experienceId) {
  const result = await query(
    `
    SELECT
      ex.*,
      GREATEST(0, ex.max_capacity - ex.reserved_spots)::INTEGER AS available_spots
    FROM expeditions ex
    WHERE ex.experience_id = $1
      AND ex.status IN ('published', 'open', 'full')
      AND ex.end_date >= CURRENT_DATE
    ORDER BY ex.start_date ASC
    LIMIT 10
    `,
    [experienceId]
  );
  return result.rows;
}

async function findByCompany(companyId, filters = {}, pagination = { limit: 20, offset: 0 }) {
  const conditions = ['ex.company_id = $1'];
  const params = [companyId];

  if (filters.status) {
    params.push(filters.status);
    conditions.push(`ex.status = $${params.length}`);
  }

  if (filters.search) {
    params.push(`%${filters.search}%`);
    conditions.push(`(ex.title ILIKE $${params.length} OR d.name ILIKE $${params.length})`);
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;

  const countResult = await query(
    `
    SELECT COUNT(*)::INTEGER AS total
    FROM expeditions ex
    LEFT JOIN destinations d ON d.id = ex.destination_id
    ${whereClause}
    `,
    params
  );

  params.push(pagination.limit, pagination.offset);

  const listResult = await query(
    `
    SELECT
      ex.*,
      d.name AS destination_name,
      g.full_name AS guide_name,
      t.name AS transport_name,
      (
        SELECT COUNT(*)::INTEGER
        FROM expedition_waitlist ew
        WHERE ew.expedition_id = ex.id AND ew.status IN ('waiting', 'notified')
      ) AS waitlist_count
    FROM expeditions ex
    LEFT JOIN destinations d ON d.id = ex.destination_id
    LEFT JOIN guides g ON g.id = ex.guide_id
    LEFT JOIN transports t ON t.id = ex.transport_id
    ${whereClause}
    ORDER BY ex.start_date DESC, ex.created_at DESC
    LIMIT $${params.length - 1} OFFSET $${params.length}
    `,
    params
  );

  return {
    items: listResult.rows,
    total: countResult.rows[0].total
  };
}

async function createExpedition({
  companyId,
  createdByUserId,
  experienceId = null,
  destinationId,
  guideId = null,
  transportId = null,
  routeId = null,
  title,
  slug,
  description,
  minCapacity = 1,
  maxCapacity,
  pricePerParticipant,
  startDate,
  endDate,
  departureTime = null,
  meetingPoint = null,
  conditions = null,
  cancellationPolicy = null,
  waitlistEnabled = true,
  status = 'open',
  coverImageUrl = null
}) {
  const result = await query(
    `
    INSERT INTO expeditions (
      company_id,
      created_by_user_id,
      experience_id,
      destination_id,
      guide_id,
      transport_id,
      route_id,
      title,
      slug,
      description,
      min_capacity,
      max_capacity,
      reserved_spots,
      price_per_participant,
      start_date,
      end_date,
      departure_time,
      meeting_point,
      conditions,
      cancellation_policy,
      waitlist_enabled,
      status,
      cover_image_url
    )
    VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 0,
      $13, $14, $15, $16, $17, $18, $19, $20, $21, $22
    )
    RETURNING *
    `,
    [
      companyId,
      createdByUserId,
      experienceId,
      destinationId,
      guideId,
      transportId,
      routeId,
      title,
      slug,
      description,
      minCapacity,
      maxCapacity,
      pricePerParticipant,
      startDate,
      endDate,
      departureTime,
      meetingPoint,
      conditions,
      cancellationPolicy,
      Boolean(waitlistEnabled),
      status,
      coverImageUrl
    ]
  );
  return result.rows[0];
}

async function updateExpedition(expeditionId, payload) {
  const fieldMap = {
    experienceId: 'experience_id',
    destinationId: 'destination_id',
    guideId: 'guide_id',
    transportId: 'transport_id',
    routeId: 'route_id',
    title: 'title',
    description: 'description',
    minCapacity: 'min_capacity',
    maxCapacity: 'max_capacity',
    pricePerParticipant: 'price_per_participant',
    startDate: 'start_date',
    endDate: 'end_date',
    departureTime: 'departure_time',
    meetingPoint: 'meeting_point',
    conditions: 'conditions',
    cancellationPolicy: 'cancellation_policy',
    waitlistEnabled: 'waitlist_enabled',
    status: 'status',
    coverImageUrl: 'cover_image_url'
  };

  const updates = [];
  const params = [expeditionId];

  for (const [key, col] of Object.entries(fieldMap)) {
    if (payload[key] !== undefined) {
      params.push(payload[key]);
      updates.push(`${col} = $${params.length}`);
    }
  }

  if (updates.length === 0) {
    return findById(expeditionId);
  }

  updates.push('updated_at = NOW()');

  const result = await query(
    `
    UPDATE expeditions
    SET ${updates.join(', ')}
    WHERE id = $1
    RETURNING *
    `,
    params
  );
  return result.rows[0] || null;
}

module.exports = {
  findById,
  findByIdForUpdate,
  updateReservedSpots,
  findPublic,
  findPublicDetailedByIdOrSlug,
  findUpcomingByExperienceId,
  findByCompany,
  createExpedition,
  updateExpedition
};