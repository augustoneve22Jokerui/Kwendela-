'use strict';

const { query } = require('../config/database');

function exec(client, text, params = []) {
  return client ? client.query(text, params) : query(text, params);
}

async function findById(reviewId) {
  const result = await query(
    `
    SELECT *
    FROM reviews
    WHERE id = $1
    `,
    [reviewId]
  );
  return result.rows[0] || null;
}

async function findByUserAndTarget(userId, targetType, targetId) {
  const result = await query(
    `
    SELECT *
    FROM reviews
    WHERE user_id = $1
      AND target_type = $2
      AND target_id = $3
    LIMIT 1
    `,
    [userId, targetType, targetId]
  );
  return result.rows[0] || null;
}

async function findPublic(filters = {}, pagination = { limit: 12, offset: 0 }) {
  const conditions = ['r.is_visible = TRUE'];
  const params = [];

  if (filters.targetType) {
    params.push(filters.targetType);
    conditions.push(`r.target_type = $${params.length}`);
  }

  if (filters.targetId) {
    params.push(filters.targetId);
    conditions.push(`r.target_id = $${params.length}`);
  }

  if (filters.minRating) {
    params.push(Number(filters.minRating));
    conditions.push(`r.rating >= $${params.length}`);
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;

  const countResult = await query(
    `SELECT COUNT(*)::INTEGER AS total FROM reviews r ${whereClause}`,
    params
  );

  params.push(pagination.limit, pagination.offset);

  const listResult = await query(
    `
    SELECT
      r.*,
      u.full_name AS reviewer_name,
      u.avatar_url AS reviewer_avatar_url
    FROM reviews r
    INNER JOIN users u ON u.id = r.user_id
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

async function findByUser(userId, pagination = { limit: 12, offset: 0 }) {
  const countResult = await query(
    `SELECT COUNT(*)::INTEGER AS total FROM reviews WHERE user_id = $1`,
    [userId]
  );

  const listResult = await query(
    `
    SELECT
      r.*,
      COALESCE(d.name, e.title, c.name) AS target_name
    FROM reviews r
    LEFT JOIN destinations d ON r.target_type = 'destination' AND d.id = r.target_id
    LEFT JOIN experiences e ON r.target_type = 'experience' AND e.id = r.target_id
    LEFT JOIN companies c ON r.target_type = 'company' AND c.id = r.target_id
    WHERE r.user_id = $1
    ORDER BY r.created_at DESC
    LIMIT $2 OFFSET $3
    `,
    [userId, pagination.limit, pagination.offset]
  );

  return {
    items: listResult.rows,
    total: countResult.rows[0].total
  };
}

async function createReview(
  {
    userId,
    targetType,
    targetId,
    targetCompanyId = null,
    bookingId = null,
    rating,
    title = null,
    comment,
    isVerifiedBooking = false
  },
  client = null
) {
  const result = await exec(
    client,
    `
    INSERT INTO reviews (
      user_id,
      target_type,
      target_id,
      target_company_id,
      booking_id,
      rating,
      title,
      comment,
      is_verified_booking
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *
    `,
    [
      userId,
      targetType,
      targetId,
      targetCompanyId,
      bookingId,
      Number(rating),
      title,
      comment,
      Boolean(isVerifiedBooking)
    ]
  );
  return result.rows[0];
}

async function updateReview(reviewId, payload, client = null) {
  const updates = [];
  const params = [reviewId];

  if (payload.rating !== undefined) {
    params.push(Number(payload.rating));
    updates.push(`rating = $${params.length}`);
  }
  if (payload.title !== undefined) {
    params.push(payload.title);
    updates.push(`title = $${params.length}`);
  }
  if (payload.comment !== undefined) {
    params.push(payload.comment);
    updates.push(`comment = $${params.length}`);
  }

  if (updates.length === 0) {
    return findById(reviewId);
  }

  updates.push('updated_at = NOW()');

  const result = await exec(
    client,
    `
    UPDATE reviews
    SET ${updates.join(', ')}
    WHERE id = $1
    RETURNING *
    `,
    params
  );
  return result.rows[0] || null;
}

async function deleteReview(reviewId, client = null) {
  await exec(
    client,
    `
    DELETE FROM reviews
    WHERE id = $1
    `,
    [reviewId]
  );
}

async function setCompanyReply(reviewId, companyReply) {
  const result = await query(
    `
    UPDATE reviews
    SET company_reply = $2,
        company_replied_at = NOW(),
        updated_at = NOW()
    WHERE id = $1
    RETURNING *
    `,
    [reviewId, companyReply]
  );
  return result.rows[0] || null;
}

async function recalculateTargetRating(targetType, targetId, client = null) {
  const aggResult = await exec(
    client,
    `
    SELECT
      COALESCE(ROUND(AVG(rating)::numeric, 2), 0)::NUMERIC(3,2) AS rating_avg,
      COUNT(*)::INTEGER AS reviews_count
    FROM reviews
    WHERE target_type = $1
      AND target_id = $2
      AND is_visible = TRUE
    `,
    [targetType, targetId]
  );

  const { rating_avg: ratingAvg, reviews_count: reviewsCount } = aggResult.rows[0];

  const targetTableMap = {
    destination: 'destinations',
    experience: 'experiences',
    company: 'companies'
  };

  const targetTable = targetTableMap[targetType];
  if (!targetTable) {
    return;
  }

  await exec(
    client,
    `
    UPDATE ${targetTable}
    SET rating_avg = $2,
        reviews_count = $3,
        updated_at = NOW()
    WHERE id = $1
    `,
    [targetId, ratingAvg, reviewsCount]
  );
}

module.exports = {
  findById,
  findByUserAndTarget,
  findPublic,
  findByUser,
  createReview,
  updateReview,
  deleteReview,
  setCompanyReply,
  recalculateTargetRating
};