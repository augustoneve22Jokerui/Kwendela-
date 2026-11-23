'use strict';

const { query } = require('../config/database');

function exec(client, text, params = []) {
  return client ? client.query(text, params) : query(text, params);
}

async function findUserForLogin(email) {
  const result = await query(
    `
    SELECT
      u.id,
      u.full_name,
      u.email,
      u.phone,
      u.password_hash,
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
    WHERE LOWER(u.email) = LOWER($1)
    LIMIT 1
    `,
    [email]
  );
  return result.rows[0] || null;
}

async function findUserWithPasswordById(userId) {
  const result = await query(
    `
    SELECT id, email, password_hash, role, status, must_change_password
    FROM users
    WHERE id = $1
    `,
    [userId]
  );
  return result.rows[0] || null;
}

async function updateLastLogin(userId) {
  await query(
    `
    UPDATE users
    SET last_login_at = NOW(),
        updated_at = NOW()
    WHERE id = $1
    `,
    [userId]
  );
}

async function saveRefreshToken(
  { userId, tokenHash, familyId, expiresAt, ipAddress = null, userAgent = null },
  client = null
) {
  const result = await exec(
    client,
    `
    INSERT INTO refresh_tokens (
      user_id,
      token_hash,
      family_id,
      expires_at,
      ip_address,
      user_agent
    )
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *
    `,
    [
      userId,
      tokenHash,
      familyId,
      expiresAt,
      ipAddress,
      userAgent ? String(userAgent).slice(0, 500) : null
    ]
  );
  return result.rows[0];
}

async function findRefreshTokenByHash(tokenHash) {
  const result = await query(
    `
    SELECT *
    FROM refresh_tokens
    WHERE token_hash = $1
    LIMIT 1
    `,
    [tokenHash]
  );
  return result.rows[0] || null;
}

async function revokeRefreshTokenById(id, client = null) {
  await exec(
    client,
    `
    UPDATE refresh_tokens
    SET revoked_at = NOW()
    WHERE id = $1 AND revoked_at IS NULL
    `,
    [id]
  );
}

async function revokeRefreshTokenByHash(tokenHash, client = null) {
  await exec(
    client,
    `
    UPDATE refresh_tokens
    SET revoked_at = NOW()
    WHERE token_hash = $1 AND revoked_at IS NULL
    `,
    [tokenHash]
  );
}

async function revokeRefreshTokenFamily(familyId, client = null) {
  await exec(
    client,
    `
    UPDATE refresh_tokens
    SET revoked_at = NOW()
    WHERE family_id = $1 AND revoked_at IS NULL
    `,
    [familyId]
  );
}

async function revokeAllUserRefreshTokens(userId, client = null) {
  await exec(
    client,
    `
    UPDATE refresh_tokens
    SET revoked_at = NOW()
    WHERE user_id = $1 AND revoked_at IS NULL
    `,
    [userId]
  );
}

async function invalidatePendingPasswordResets(userId, client = null) {
  await exec(
    client,
    `
    UPDATE password_reset_tokens
    SET used_at = NOW()
    WHERE user_id = $1 AND used_at IS NULL
    `,
    [userId]
  );
}

async function createPasswordResetToken({ userId, tokenHash, expiresAt }, client = null) {
  const result = await exec(
    client,
    `
    INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
    VALUES ($1, $2, $3)
    RETURNING *
    `,
    [userId, tokenHash, expiresAt]
  );
  return result.rows[0];
}

async function findValidPasswordResetToken(tokenHash) {
  const result = await query(
    `
    SELECT *
    FROM password_reset_tokens
    WHERE token_hash = $1
      AND used_at IS NULL
      AND expires_at > NOW()
    LIMIT 1
    `,
    [tokenHash]
  );
  return result.rows[0] || null;
}

async function markPasswordResetTokenUsed(id, client = null) {
  await exec(
    client,
    `
    UPDATE password_reset_tokens
    SET used_at = NOW()
    WHERE id = $1
    `,
    [id]
  );
}

async function updateUserPassword(userId, { passwordHash, mustChangePassword = false }, client = null) {
  await exec(
    client,
    `
    UPDATE users
    SET password_hash = $2,
        must_change_password = $3,
        password_changed_at = NOW(),
        updated_at = NOW()
    WHERE id = $1
    `,
    [userId, passwordHash, Boolean(mustChangePassword)]
  );
}

module.exports = {
  findUserForLogin,
  findUserWithPasswordById,
  updateLastLogin,
  saveRefreshToken,
  findRefreshTokenByHash,
  revokeRefreshTokenById,
  revokeRefreshTokenByHash,
  revokeRefreshTokenFamily,
  revokeAllUserRefreshTokens,
  invalidatePendingPasswordResets,
  createPasswordResetToken,
  findValidPasswordResetToken,
  markPasswordResetTokenUsed,
  updateUserPassword
};