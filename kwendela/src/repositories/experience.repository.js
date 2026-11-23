'use strict';

const { query } = require('../config/database');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ALLOWED_SORT_COLUMNS = {
  created_at: 'e.created_at',
  price_kz: 'e.price_kz',
  rating_avg: 'e.rating_avg',
  duration_hours: 'e.duration_hours',
  title: 'e.title'
};

function exec(client, text, params = []) {
  return client ? client.query(text, params) : query(text, params);
}

async function findById(experienceId, client = null) {
  const result = await exec(
    client,
    `
    SELECT *
    FROM experiences
    WHERE id = $1
    `,
    [experienceId]
  );
  return result.rows[0] || null;
}

async function findPublic(
  filters = {},
  pagination = { limit: 12, offset: 0, sortBy: 'created_at', sortOrder: 'DESC' }
) {
  const conditions = [
    `e.moderation_status = 'approved'`,
    `e.is_active = TRUE`,
    `c.status = 'active'`
  ];
  const params = [];

  if (filters.destinationId) {
    params.push(filters.destinationId);
    conditions.push(`e.destination_id = $${params.length}`);
  }

  if (filters.companyId) {
    params.push(filters.companyId);
    conditions.push(`e.company_id = $${params.length}`);
  }

  if (filters.province) {
    params.push(filters.province);
    conditions.push(`d.province ILIKE $${params.length}`);
  }

  if (filters.category) {
    params.push(filters.category);
    conditions.push(`e.category = $${params.length}`);
  }

  if (filters.experienceType) {
    params.push(filters.experienceType);
    conditions.push(`e.experience_type = $${params.length}`);
  }

  if (filters.difficultyLevel) {
    params.push(filters.difficultyLevel);
    conditions.push(`e.difficulty_level = $${params.length}`);
  }

  if (filters.minPrice !== undefined && filters.minPrice !== '') {
    params.push(Number(filters.minPrice));
    conditions.push(`e.price_kz >= $${params.length}`);
  }

  if (filters.maxPrice !== undefined && filters.maxPrice !== '') {
    params.push(Number(filters.maxPrice));
    conditions.push(`e.price_kz <= $${params.length}`);
  }

  if (filters.search) {
    params.push(`%${filters.search}%`);
    conditions.push(
      `(e.title ILIKE $${params.length} OR e.short_description ILIKE $${params.length} OR d.name ILIKE $${params.length} OR d.province ILIKE $${params.length})`
    );
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;
  const sortCol = ALLOWED_SORT_COLUMNS[pagination.sortBy] || 'e.created_at';
  const sortOrder = String(pagination.sortOrder).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  const countResult = await query(
    `
    SELECT COUNT(*)::INTEGER AS total
    FROM experiences e
    INNER JOIN companies c ON c.id = e.company_id
    INNER JOIN destinations d ON d.id = e.destination_id
    ${whereClause}
    `,
    params
  );

  params.push(pagination.limit, pagination.offset);

  const listResult = await query(
    `
    SELECT
      e.*,
      c.name AS company_name,
      c.is_verified AS company_verified,
      d.name AS destination_name,
      d.slug AS destination_slug,
      d.province AS destination_province
    FROM experiences e
    INNER JOIN companies c ON c.id = e.company_id
    INNER JOIN destinations d ON d.id = e.destination_id
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

async function findPublicByIdOrSlug(idOrSlug) {
  const isUuid = UUID_REGEX.test(String(idOrSlug));
  const lookupCondition = isUuid ? 'e.id = $1' : 'e.slug = $1';

  const result = await query(
    `
    SELECT
      e.*,
      c.name AS company_name,
      c.slug AS company_slug,
      c.is_verified AS company_verified,
      c.logo_url AS company_logo_url,
      d.name AS destination_name,
      d.slug AS destination_slug,
      d.province AS destination_province,
      d.latitude AS destination_latitude,
      d.longitude AS destination_longitude
    FROM experiences e
    INNER JOIN companies c ON c.id = e.company_id
    INNER JOIN destinations d ON d.id = e.destination_id
    WHERE ${lookupCondition}
      AND e.moderation_status = 'approved'
      AND e.is_active = TRUE
      AND c.status = 'active'
    LIMIT 1
    `,
    [idOrSlug]
  );

  return result.rows[0] || null;
}

async function findMediaByExperienceId(experienceId) {
  const result = await query(
    `
    SELECT *
    FROM experience_media
    WHERE experience_id = $1
    ORDER BY is_cover DESC, display_order ASC, created_at ASC
    `,
    [experienceId]
  );
  return result.rows;
}

async function findByCompany(companyId, filters = {}, pagination = { limit: 20, offset: 0 }) {
  const conditions = [`e.company_id = $1`, `e.moderation_status <> 'archived'`];
  const params = [companyId];

  if (filters.moderationStatus) {
    params.push(filters.moderationStatus);
    conditions.push(`e.moderation_status = $${params.length}`);
  }

  if (filters.experienceType) {
    params.push(filters.experienceType);
    conditions.push(`e.experience_type = $${params.length}`);
  }

  if (filters.search) {
    params.push(`%${filters.search}%`);
    conditions.push(`(e.title ILIKE $${params.length} OR d.name ILIKE $${params.length})`);
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;

  const countResult = await query(
    `
    SELECT COUNT(*)::INTEGER AS total
    FROM experiences e
    LEFT JOIN destinations d ON d.id = e.destination_id
    ${whereClause}
    `,
    params
  );

  params.push(pagination.limit, pagination.offset);

  const listResult = await query(
    `
    SELECT
      e.*,
      d.name AS destination_name,
      d.province AS destination_province,
      (SELECT COUNT(*)::INTEGER FROM experience_media em WHERE em.experience_id = e.id) AS media_count
    FROM experiences e
    LEFT JOIN destinations d ON d.id = e.destination_id
    ${whereClause}
    ORDER BY e.created_at DESC
    LIMIT $${params.length - 1} OFFSET $${params.length}
    `,
    params
  );

  return {
    items: listResult.rows,
    total: countResult.rows[0].total
  };
}

async function createExperience({
  companyId,
  destinationId,
  createdByUserId,
  title,
  slug,
  shortDescription,
  description,
  category = 'culture',
  experienceType = 'experience',
  durationHours,
  priceKz,
  maxGroupSize = 15,
  difficultyLevel = 'moderate',
  includes = [],
  excludes = [],
  requirements = [],
  meetingPoint = null,
  languages = ['Português'],
  coverImageUrl = null,
  isActive = true,
  moderationStatus = 'pending_review'
}) {
  const result = await query(
    `
    INSERT INTO experiences (
      company_id,
      destination_id,
      created_by_user_id,
      title,
      slug,
      short_description,
      description,
      category,
      experience_type,
      duration_hours,
      price_kz,
      max_group_size,
      difficulty_level,
      includes,
      excludes,
      requirements,
      meeting_point,
      languages,
      cover_image_url,
      is_active,
      moderation_status
    )
    VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
      $14::jsonb, $15::jsonb, $16::jsonb, $17, $18::jsonb, $19, $20, $21
    )
    RETURNING *
    `,
    [
      companyId,
      destinationId,
      createdByUserId,
      title,
      slug,
      shortDescription,
      description,
      category,
      experienceType,
      durationHours,
      priceKz,
      maxGroupSize,
      difficultyLevel,
      JSON.stringify(includes || []),
      JSON.stringify(excludes || []),
      JSON.stringify(requirements || []),
      meetingPoint,
      JSON.stringify(languages || ['Português']),
      coverImageUrl,
      Boolean(isActive),
      moderationStatus
    ]
  );

  return result.rows[0];
}

async function updateExperience(experienceId, payload) {
  const updates = [];
  const params = [experienceId];

  const scalarMap = {
    destinationId: 'destination_id',
    title: 'title',
    shortDescription: 'short_description',
    description: 'description',
    category: 'category',
    experienceType: 'experience_type',
    durationHours: 'duration_hours',
    priceKz: 'price_kz',
    maxGroupSize: 'max_group_size',
    difficultyLevel: 'difficulty_level',
    meetingPoint: 'meeting_point',
    coverImageUrl: 'cover_image_url',
    isActive: 'is_active'
  };

  for (const [key, col] of Object.entries(scalarMap)) {
    if (payload[key] !== undefined) {
      params.push(payload[key]);
      updates.push(`${col} = $${params.length}`);
    }
  }

  const jsonMap = {
    includes: 'includes',
    excludes: 'excludes',
    requirements: 'requirements',
    languages: 'languages'
  };

  for (const [key, col] of Object.entries(jsonMap)) {
    if (payload[key] !== undefined) {
      params.push(JSON.stringify(payload[key] || []));
      updates.push(`${col} = $${params.length}::jsonb`);
    }
  }

  if (updates.length === 0) {
    return findById(experienceId);
  }

  updates.push('updated_at = NOW()');

  const result = await query(
    `
    UPDATE experiences
    SET ${updates.join(', ')}
    WHERE id = $1
    RETURNING *
    `,
    params
  );

  return result.rows[0] || null;
}

async function archiveExperience(experienceId) {
  await query(
    `
    UPDATE experiences
    SET moderation_status = 'archived',
        is_active = FALSE,
        updated_at = NOW()
    WHERE id = $1
    `,
    [experienceId]
  );
}

async function addMedia(
  experienceId,
  { mediaType = 'image', url, caption = null, isCover = false, displayOrder = 0, uploadedByUserId }
) {
  if (isCover) {
    await query(
      `UPDATE experience_media SET is_cover = FALSE WHERE experience_id = $1`,
      [experienceId]
    );
  }

  const result = await query(
    `
    INSERT INTO experience_media (
      experience_id,
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
    [experienceId, mediaType, url, caption, Boolean(isCover), displayOrder, uploadedByUserId]
  );

  return result.rows[0];
}

async function removeMedia(experienceId, mediaId) {
  const result = await query(
    `
    DELETE FROM experience_media
    WHERE experience_id = $1 AND id = $2
    RETURNING *
    `,
    [experienceId, mediaId]
  );

  return result.rows[0] || null;
}

module.exports = {
  findById,
  findPublic,
  findPublicByIdOrSlug,
  findMediaByExperienceId,
  findByCompany,
  createExperience,
  updateExperience,
  archiveExperience,
  addMedia,
  removeMedia
};