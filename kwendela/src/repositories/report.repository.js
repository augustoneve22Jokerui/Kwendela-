'use strict';

const { query } = require('../config/database');

async function createReport({
  reporterUserId,
  targetType,
  targetId,
  reason,
  description
}) {
  const result = await query(
    `
    INSERT INTO reports (
      reporter_user_id,
      target_type,
      target_id,
      reason,
      description,
      status
    )
    VALUES ($1, $2, $3, $4, $5, 'open')
    RETURNING *
    `,
    [reporterUserId, targetType, targetId, reason, description]
  );
  return result.rows[0];
}

async function findById(reportId) {
  const result = await query(
    `
    SELECT
      r.*,
      u.full_name AS reporter_name,
      u.email AS reporter_email
    FROM reports r
    INNER JOIN users u ON u.id = r.reporter_user_id
    WHERE r.id = $1
    `,
    [reportId]
  );
  return result.rows[0] || null;
}

async function findByReporter(reporterUserId, pagination = { limit: 20, offset: 0 }) {
  const countResult = await query(
    `
    SELECT COUNT(*)::INTEGER AS total
    FROM reports
    WHERE reporter_user_id = $1
    `,
    [reporterUserId]
  );

  const listResult = await query(
    `
    SELECT *
    FROM reports
    WHERE reporter_user_id = $1
    ORDER BY created_at DESC
    LIMIT $2 OFFSET $3
    `,
    [reporterUserId, pagination.limit, pagination.offset]
  );

  return {
    items: listResult.rows,
    total: countResult.rows[0].total
  };
}

module.exports = {
  createReport,
  findById,
  findByReporter
};