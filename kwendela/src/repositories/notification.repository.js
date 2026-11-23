'use strict';

const { query } = require('../config/database');

function exec(client, text, params = []) {
  return client ? client.query(text, params) : query(text, params);
}

async function create(
  {
    userId,
    type,
    title,
    message,
    referenceType = null,
    referenceId = null,
    metadata = {}
  },
  client = null
) {
  const result = await exec(
    client,
    `
    INSERT INTO notifications (
      user_id,
      type,
      title,
      message,
      reference_type,
      reference_id,
      metadata
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
    RETURNING *
    `,
    [
      userId,
      type,
      title,
      message,
      referenceType,
      referenceId ? String(referenceId) : null,
      JSON.stringify(metadata || {})
    ]
  );
  return result.rows[0];
}

async function findByUser(userId, filters = {}, pagination = { limit: 20, offset: 0 }) {
  const conditions = ['user_id = $1'];
  const params = [userId];

  if (filters.unreadOnly === true || String(filters.unreadOnly) === 'true') {
    conditions.push('is_read = FALSE');
  }

  if (filters.type) {
    params.push(filters.type);
    conditions.push(`type = $${params.length}`);
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;

  const countResult = await query(
    `SELECT COUNT(*)::INTEGER AS total FROM notifications ${whereClause}`,
    params
  );

  params.push(pagination.limit, pagination.offset);

  const listResult = await query(
    `
    SELECT *
    FROM notifications
    ${whereClause}
    ORDER BY created_at DESC
    LIMIT $${params.length - 1} OFFSET $${params.length}
    `,
    params
  );

  return {
    items: listResult.rows,
    total: countResult.rows[0].total
  };
}

async function countUnread(userId) {
  const result = await query(
    `
    SELECT COUNT(*)::INTEGER AS unread_count
    FROM notifications
    WHERE user_id = $1 AND is_read = FALSE
    `,
    [userId]
  );
  return result.rows[0] ? result.rows[0].unread_count : 0;
}

async function markAsRead(notificationId, userId) {
  const result = await query(
    `
    UPDATE notifications
    SET is_read = TRUE,
        read_at = COALESCE(read_at, NOW())
    WHERE id = $1 AND user_id = $2
    RETURNING *
    `,
    [notificationId, userId]
  );
  return result.rows[0] || null;
}

async function markAllAsRead(userId) {
  const result = await query(
    `
    UPDATE notifications
    SET is_read = TRUE,
        read_at = COALESCE(read_at, NOW())
    WHERE user_id = $1 AND is_read = FALSE
    `,
    [userId]
  );
  return result.rowCount;
}

module.exports = {
  create,
  findByUser,
  countUnread,
  markAsRead,
  markAllAsRead
};