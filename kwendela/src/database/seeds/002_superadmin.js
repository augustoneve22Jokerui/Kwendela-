'use strict';

const { withTransaction } = require('../../config/database');
const env = require('../../config/env');
const logger = require('../../config/logger');
const { hashPassword, generateAccountCode } = require('../../utils/crypto');

async function seedSuperadmin() {
  const email = (env.superadmin.email || '').trim().toLowerCase();
  const password = env.superadmin.password || '';
  const fullName = (env.superadmin.name || 'Super Administrador KWENDELA').trim();

  if (!email || !password) {
    logger.warn(
      'Seed do Superadministrador ignorado: defina SUPERADMIN_EMAIL e SUPERADMIN_PASSWORD nas variáveis de ambiente.'
    );
    return {
      created: false,
      skipped: true
    };
  }

  return withTransaction(async (client) => {
    const existingResult = await client.query(
      `
      SELECT id, email, role
      FROM users
      WHERE LOWER(email) = LOWER($1)
      LIMIT 1
      `,
      [email]
    );

    if (existingResult.rowCount > 0) {
      const existing = existingResult.rows[0];

      const existingWallet = await client.query(
        `
        SELECT id
        FROM wallets
        WHERE owner_user_id = $1 AND owner_type = 'user'
        LIMIT 1
        `,
        [existing.id]
      );

      if (existingWallet.rowCount === 0) {
        await client.query(
          `
          INSERT INTO wallets (owner_type, owner_user_id, account_code, currency, available_balance, reserved_balance)
          VALUES ('user', $1, $2, 'AOA', 0, 0)
          `,
          [existing.id, generateAccountCode('KWD')]
        );
      }

      return {
        created: false,
        skipped: false,
        userId: existing.id,
        email: existing.email
      };
    }

    const passwordHash = await hashPassword(password);

    const userResult = await client.query(
      `
      INSERT INTO users (
        full_name,
        email,
        password_hash,
        role,
        status,
        must_change_password,
        preferred_language
      )
      VALUES ($1, LOWER($2), $3, 'superadmin', 'active', FALSE, 'pt')
      RETURNING id, email
      `,
      [fullName, email, passwordHash]
    );

    const superadmin = userResult.rows[0];

    await client.query(
      `
      INSERT INTO wallets (owner_type, owner_user_id, account_code, currency, available_balance, reserved_balance)
      VALUES ('user', $1, $2, 'AOA', 0, 0)
      `,
      [superadmin.id, generateAccountCode('KWD')]
    );

    logger.info('Conta inicial de Superadministrador criada com sucesso', {
      userId: superadmin.id,
      email: superadmin.email
    });

    return {
      created: true,
      skipped: false,
      userId: superadmin.id,
      email: superadmin.email
    };
  });
}

module.exports = {
  seedSuperadmin
};