'use strict';

const { query } = require('../config/database');

function exec(client, text, params = []) {
  return client ? client.query(text, params) : query(text, params);
}

const SAFE_USER_COLUMNS = `
  id,
  full_name,
  email,
  phone,
  role,
  status,
  must_change_password,
  is_premium,
  premium_expires_at,
  avatar_url,
  bio,
  province,
  city,
  nationality,
  preferred_language,
  last_login_at,
  created_at,
  updated_at
`;

async function findAuthContextById(userId) {
  const result = await query(
    `
    SELECT
      u.id,
      u.full_name,
      u.email,
      u.phone,
      u.role,
      u.status,
      u.must_change_password,
      u.is_premium,
      u.premium_expires_at,
      u.avatar_url,
      cm.company_id,
      cm.role AS company_role,
      c.name AS company_name,
      c.status AS company_status
    FROM users u
    LEFT JOIN company_members cm
      ON cm.user_id = u.id AND cm.is_active = TRUE
    LEFT JOIN companies c
      ON c.id = cm.company_id
    WHERE u.id = $1
    LIMIT 1
    `,
    [userId]
  );
  return result.rows[0] || null;
}

async function findById(userId) {
  const result = await query(
    `
    SELECT ${SAFE_USER_COLUMNS}
    FROM users
    WHERE id = $1
    `,
    [userId]
  );
  return result.rows[0] || null;
}

async function findByEmail(email) {
  const result = await query(
    `
    SELECT ${SAFE_USER_COLUMNS}
    FROM users
    WHERE LOWER(email) = LOWER($1)
    LIMIT 1
    `,
    [email]
  );
  return result.rows[0] || null;
}

async function findProfileById(userId) {
  const result = await query(
    `
    SELECT
      u.id,
      u.full_name,
      u.email,
      u.phone,
      u.role,
      u.status,
      u.must_change_password,
      u.is_premium,
      u.premium_expires_at,
      u.avatar_url,
      u.bio,
      u.province,
      u.city,
      u.nationality,
      u.preferred_language,
      u.last_login_at,
      u.created_at,
      (SELECT COUNT(*)::INTEGER FROM bookings b WHERE b.user_id = u.id) AS bookings_count,
      (SELECT COUNT(*)::INTEGER FROM favorites f WHERE f.user_id = u.id) AS favorites_count,
      (SELECT COUNT(*)::INTEGER FROM reviews r WHERE r.user_id = u.id) AS reviews_count
    FROM users u
    WHERE u.id = $1
    `,
    [userId]
  );
  return result.rows[0] || null;
}

async function createUser(
  {
    fullName,
    email,
    phone = null,
    passwordHash,
    role = 'tourist',
    status = 'active',
    mustChangePassword = false,
    nationality = null,
    preferredLanguage = 'pt'
  },
  client = null
) {
  const result = await exec(
    client,
    `
    INSERT INTO users (
      full_name,
      email,
      phone,
      password_hash,
      role,
      status,
      must_change_password,
      nationality,
      preferred_language
    )
    VALUES ($1, LOWER($2), $3, $4, $5, $6, $7, $8, $9)
    RETURNING ${SAFE_USER_COLUMNS}
    `,
    [
      fullName,
      email,
      phone,
      passwordHash,
      role,
      status,
      Boolean(mustChangePassword),
      nationality,
      preferredLanguage
    ]
  );
  return result.rows[0];
}

async function updateProfile(userId, payload) {
  const fieldMap = {
    fullName: 'full_name',
    phone: 'phone',
    bio: 'bio',
    province: 'province',
    city: 'city',
    nationality: 'nationality',
    preferredLanguage: 'preferred_language'
  };

  const updates = [];
  const params = [userId];

  for (const [key, col] of Object.entries(fieldMap)) {
    if (payload[key] !== undefined) {
      params.push(payload[key]);
      updates.push(`${col} = $${params.length}`);
    }
  }

  if (updates.length === 0) {
    return findById(userId);
  }

  updates.push('updated_at = NOW()');

  const result = await query(
    `
    UPDATE users
    SET ${updates.join(', ')}
    WHERE id = $1
    RETURNING ${SAFE_USER_COLUMNS}
    `,
    params
  );
  return result.rows[0] || null;
}

async function updateAvatar(userId, avatarUrl) {
  const result = await query(
    `
    UPDATE users
    SET avatar_url = $2,
        updated_at = NOW()
    WHERE id = $1
    RETURNING ${SAFE_USER_COLUMNS}
    `,
    [userId, avatarUrl]
  );
  return result.rows[0] || null;
}

async function updateStatus(userId, status) {
  const result = await query(
    `
    UPDATE users
    SET status = $2,
        updated_at = NOW()
    WHERE id = $1
    RETURNING ${SAFE_USER_COLUMNS}
    `,
    [userId, status]
  );
  return result.rows[0] || null;
}

async function activatePremium(userId, durationDays = 30, client = null) {
  const result = await exec(
    client,
    `
    UPDATE users
    SET is_premium = TRUE,
        premium_expires_at = GREATEST(COALESCE(premium_expires_at, NOW()), NOW()) + make_interval(days => $2),
        updated_at = NOW()
    WHERE id = $1
    RETURNING ${SAFE_USER_COLUMNS}
    `,
    [userId, Number(durationDays)]
  );
  return result.rows[0] || null;
}

async function findAllAdmin(filters = {}, pagination = { limit: 20, offset: 0 }) {
  const conditions = [];
  const params = [];

  if (filters.role) {
    params.push(filters.role);
    conditions.push(`u.role = $${params.length}`);
  }

  if (filters.status) {
    params.push(filters.status);
    conditions.push(`u.status = $${params.length}`);
  }

  if (filters.search) {
    params.push(`%${filters.search}%`);
    conditions.push(`(u.full_name ILIKE $${params.length} OR u.email ILIKE $${params.length})`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await query(
    `SELECT COUNT(*)::INTEGER AS total FROM users u ${whereClause}`,
    params
  );

  params.push(pagination.limit, pagination.offset);

  const listResult = await query(
    `
    SELECT
      u.id,
      u.full_name,
      u.email,
      u.phone,
      u.role,
      u.status,
      u.is_premium,
      u.premium_expires_at,
      u.last_login_at,
      u.created_at,
      c.name AS company_name
    FROM users u
    LEFT JOIN company_members cm ON cm.user_id = u.id AND cm.is_active = TRUE
    LEFT JOIN companies c ON c.id = cm.company_id
    ${whereClause}
    ORDER BY u.created_at DESC
    LIMIT $${params.length - 1} OFFSET $${params.length}
    `,
    params
  );

  return {
    items: listResult.rows,
    total: countResult.rows[0].total
  };
}

module.exports = {
  findAuthContextById,
  findById,
  findByEmail,
  findProfileById,
  createUser,
  updateProfile,
  updateAvatar,
  updateStatus,
  activatePremium,
  findAllAdmin
};