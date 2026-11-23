'use strict';

const { query } = require('../config/database');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ALLOWED_SORT_COLUMNS = {
  created_at: 'd.created_at',
  name: 'd.name',
  rating_avg: 'd.rating_avg',
  views_count: 'd.views_count'
};

async function findById(destinationId) {
  const result = await query(
    `
    SELECT *
    FROM destinations
    WHERE id = $1
    `,
    [destinationId]
  );
  return result.rows[0] || null;
}

async function findPublic(
  filters = {},
  pagination = { limit: 12, offset: 0, sortBy: 'created_at', sortOrder: 'DESC' }
) {
  const conditions = [`d.moderation_status = 'approved'`];
  const params = [];

  if (filters.province) {
    params.push(filters.province);
    conditions.push(`d.province ILIKE $${params.length}`);
  }

  if (filters.country) {
    params.push(filters.country);
    conditions.push(`d.country ILIKE $${params.length}`);
  }

  if (filters.category) {
    params.push(filters.category);
    conditions.push(`d.category = $${params.length}`);
  }

  if (filters.featured !== undefined && filters.featured !== '') {
    params.push(String(filters.featured) === 'true' || filters.featured === true);
    conditions.push(`d.is_featured = $${params.length}`);
  }

  if (filters.search) {
    params.push(`%${filters.search}%`);
    conditions.push(
      `(d.name ILIKE $${params.length} OR d.province ILIKE $${params.length} OR d.short_description ILIKE $${params.length})`
    );
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;
  const sortCol = ALLOWED_SORT_COLUMNS[pagination.sortBy] || 'd.created_at';
  const sortOrder = String(pagination.sortOrder).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  const countResult = await query(
    `SELECT COUNT(*)::INTEGER AS total FROM destinations d ${whereClause}`,
    params
  );

  params.push(pagination.limit, pagination.offset);

  const listResult = await query(
    `
    SELECT
      d.*,
      c.name AS company_name,
      (
        SELECT COUNT(*)::INTEGER
        FROM experiences e
        WHERE e.destination_id = d.id AND e.moderation_status = 'approved' AND e.is_active = TRUE
      ) AS experiences_count
    FROM destinations d
    LEFT JOIN companies c ON c.id = d.company_id
    ${whereClause}
    ORDER BY d.is_featured DESC, ${sortCol} ${sortOrder}
    LIMIT $${params.length - 1} OFFSET $${params.length}
    `,
    params
  );

  return {
    items: listResult.rows,
    total: countResult.rows[0].total
  };
}

async function findAvailableProvinces() {
  const result = await query(
    `
    SELECT
      province,
      COUNT(*)::INTEGER AS destinations_count
    FROM destinations
    WHERE moderation_status = 'approved'
    GROUP BY province
    ORDER BY destinations_count DESC, province ASC
    `
  );
  return result.rows;
}

async function findPublicByIdOrSlug(idOrSlug) {
  const isUuid = UUID_REGEX.test(String(idOrSlug));
  const lookupCondition = isUuid ? 'd.id = $1' : 'd.slug = $1';

  const result = await query(
    `
    SELECT
      d.*,
      c.name AS company_name,
      c.slug AS company_slug,
      c.is_verified AS company_verified
    FROM destinations d
    LEFT JOIN companies c ON c.id = d.company_id
    WHERE ${lookupCondition}
      AND d.moderation_status = 'approved'
    LIMIT 1
    `,
    [idOrSlug]
  );
  return result.rows[0] || null;
}

async function incrementViewsCount(destinationId) {
  await query(
    `
    UPDATE destinations
    SET views_count = views_count + 1
    WHERE id = $1
    `,
    [destinationId]
  );
}

async function findMediaByDestinationId(destinationId) {
  const result = await query(
    `
    SELECT *
    FROM destination_media
    WHERE destination_id = $1
    ORDER BY is_cover DESC, display_order ASC, created_at ASC
    `,
    [destinationId]
  );
  return result.rows;
}

async function isFavoritedByUser(destinationId, userId) {
  const result = await query(
    `
    SELECT 1
    FROM favorites
    WHERE destination_id = $1 AND user_id = $2
    LIMIT 1
    `,
    [destinationId, userId]
  );
  return result.rowCount > 0;
}

async function addFavorite(destinationId, userId) {
  await query(
    `
    INSERT INTO favorites (user_id, destination_id)
    VALUES ($1, $2)
    ON CONFLICT (user_id, destination_id) DO NOTHING
    `,
    [userId, destinationId]
  );
}

async function removeFavorite(destinationId, userId) {
  await query(
    `
    DELETE FROM favorites
    WHERE user_id = $1 AND destination_id = $2
    `,
    [userId, destinationId]
  );
}

async function findUserFavorites(userId, pagination = { limit: 12, offset: 0 }) {
  const countResult = await query(
    `
    SELECT COUNT(*)::INTEGER AS total
    FROM favorites f
    INNER JOIN destinations d ON d.id = f.destination_id
    WHERE f.user_id = $1 AND d.moderation_status = 'approved'
    `,
    [userId]
  );

  const listResult = await query(
    `
    SELECT
      d.*,
      f.created_at AS favorited_at
    FROM favorites f
    INNER JOIN destinations d ON d.id = f.destination_id
    WHERE f.user_id = $1 AND d.moderation_status = 'approved'
    ORDER BY f.created_at DESC
    LIMIT $2 OFFSET $3
    `,
    [userId, pagination.limit, pagination.offset]
  );

  return {
    items: listResult.rows,
    total: countResult.rows[0].total
  };
}

async function findByCompany(companyId, filters = {}, pagination = { limit: 20, offset: 0 }) {
  const conditions = [`d.company_id = $1`, `d.moderation_status <> 'archived'`];
  const params = [companyId];

  if (filters.moderationStatus) {
    params.push(filters.moderationStatus);
    conditions.push(`d.moderation_status = $${params.length}`);
  }

  if (filters.search) {
    params.push(`%${filters.search}%`);
    conditions.push(`(d.name ILIKE $${params.length} OR d.province ILIKE $${params.length})`);
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;

  const countResult = await query(
    `SELECT COUNT(*)::INTEGER AS total FROM destinations d ${whereClause}`,
    params
  );

  params.push(pagination.limit, pagination.offset);

  const listResult = await query(
    `
    SELECT
      d.*,
      (SELECT COUNT(*)::INTEGER FROM destination_media dm WHERE dm.destination_id = d.id) AS media_count
    FROM destinations d
    ${whereClause}
    ORDER BY d.created_at DESC
    LIMIT $${params.length - 1} OFFSET $${params.length}
    `,
    params
  );

  return {
    items: listResult.rows,
    total: countResult.rows[0].total
  };
}

async function createDestination({
  companyId,
  createdByUserId,
  name,
  slug,
  country = 'Angola',
  province,
  municipality = null,
  category = 'nature',
  shortDescription,
  description,
  latitude,
  longitude,
  bestSeason = null,
  highlights = [],
  practicalInfo = {},
  coverImageUrl = null,
  moderationStatus = 'pending_review'
}) {
  const result = await query(
    `
    INSERT INTO destinations (
      company_id,
      created_by_user_id,
      name,
      slug,
      country,
      province,
      municipality,
      category,
      short_description,
      description,
      latitude,
      longitude,
      location,
      best_season,
      highlights,
      practical_info,
      cover_image_url,
      moderation_status
    )
    VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
      ST_SetSRID(ST_MakePoint($12, $11), 4326)::geography,
      $13, $14::jsonb, $15::jsonb, $16, $17
    )
    RETURNING *
    `,
    [
      companyId,
      createdByUserId,
      name,
      slug,
      country,
      province,
      municipality,
      category,
      shortDescription,
      description,
      latitude,
      longitude,
      bestSeason,
      JSON.stringify(highlights || []),
      JSON.stringify(practicalInfo || {}),
      coverImageUrl,
      moderationStatus
    ]
  );
  return result.rows[0];
}

async function updateDestination(destinationId, payload) {
  const updates = [];
  const params = [destinationId];

  const scalarMap = {
    name: 'name',
    country: 'country',
    province: 'province',
    municipality: 'municipality',
    category: 'category',
    shortDescription: 'short_description',
    description: 'description',
    bestSeason: 'best_season',
    coverImageUrl: 'cover_image_url'
  };

  for (const [key, col] of Object.entries(scalarMap)) {
    if (payload[key] !== undefined) {
      params.push(payload[key]);
      updates.push(`${col} = $${params.length}`);
    }
  }

  if (payload.highlights !== undefined) {
    params.push(JSON.stringify(payload.highlights || []));
    updates.push(`highlights = $${params.length}::jsonb`);
  }

  if (payload.practicalInfo !== undefined) {
    params.push(JSON.stringify(payload.practicalInfo || {}));
    updates.push(`practical_info = $${params.length}::jsonb`);
  }

  if (payload.latitude !== undefined && payload.longitude !== undefined) {
    params.push(payload.latitude, payload.longitude);
    const latIdx = params.length - 1;
    const lngIdx = params.length;
    updates.push(`latitude = $${latIdx}`);
    updates.push(`longitude = $${lngIdx}`);
    updates.push(`location = ST_SetSRID(ST_MakePoint($${lngIdx}, $${latIdx}), 4326)::geography`);
  }

  if (updates.length === 0) {
    return findById(destinationId);
  }

  updates.push('updated_at = NOW()');

  const result = await query(
    `
    UPDATE destinations
    SET ${updates.join(', ')}
    WHERE id = $1
    RETURNING *
    `,
    params
  );
  return result.rows[0] || null;
}

async function archiveDestination(destinationId) {
  await query(
    `
    UPDATE destinations
    SET moderation_status = 'archived',
        updated_at = NOW()
    WHERE id = $1
    `,
    [destinationId]
  );
}

async function addMedia(
  destinationId,
  { mediaType = 'image', url, caption = null, isCover = false, displayOrder = 0, uploadedByUserId }
) {
  if (isCover) {
    await query(
      `UPDATE destination_media SET is_cover = FALSE WHERE destination_id = $1`,
      [destinationId]
    );
  }

  const result = await query(
    `
    INSERT INTO destination_media (
      destination_id,
      media_type,
      url,
      caption,
      is_cover,
      display_order,
      uploaded_by_user_id
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *
    `,
    [destinationId, mediaType, url, caption, Boolean(isCover), displayOrder, uploadedByUserId]
  );
  return result.rows[0];
}

async function removeMedia(destinationId, mediaId) {
  const result = await query(
    `
    DELETE FROM destination_media
    WHERE destination_id = $1 AND id = $2
    RETURNING *
    `,
    [destinationId, mediaId]
  );
  return result.rows[0] || null;
}

module.exports = {
  findById,
  findPublic,
  findAvailableProvinces,
  findPublicByIdOrSlug,
  incrementViewsCount,
  findMediaByDestinationId,
  isFavoritedByUser,
  addFavorite,
  removeFavorite,
  findUserFavorites,
  findByCompany,
  createDestination,
  updateDestination,
  archiveDestination,
  addMedia,
  removeMedia
};