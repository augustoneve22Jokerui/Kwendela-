'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pool, closePool } = require('../config/database');
const logger = require('../config/logger');

const MIGRATIONS_DIR = path.resolve(__dirname, 'migrations');
const MIGRATION_LOCK_KEY = 74920184;

function computeChecksum(content) {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      filename VARCHAR(255) NOT NULL UNIQUE,
      checksum VARCHAR(64) NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

function listMigrationFiles() {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    throw new Error(`Diretório de migrations não encontrado: ${MIGRATIONS_DIR}`);
  }

  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.toLowerCase().endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b));
}

async function runMigrations({ close = false } = {}) {
  const client = await pool.connect();
  const appliedNow = [];

  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);
    await ensureMigrationsTable(client);

    const existingResult = await client.query(
      'SELECT filename, checksum FROM schema_migrations ORDER BY filename ASC'
    );
    const appliedMap = new Map(
      existingResult.rows.map((row) => [row.filename, row.checksum])
    );

    const files = listMigrationFiles();

    for (const filename of files) {
      const filePath = path.join(MIGRATIONS_DIR, filename);
      const sql = fs.readFileSync(filePath, 'utf8').trim();
      const checksum = computeChecksum(sql);

      if (appliedMap.has(filename)) {
        const previousChecksum = appliedMap.get(filename);
        if (previousChecksum !== checksum) {
          logger.warn('Checksum alterado para migration já aplicada', {
            filename
          });
        }
        continue;
      }

      await client.query('BEGIN');
      try {
        if (sql.length > 0) {
          await client.query(sql);
        }

        await client.query(
          `
          INSERT INTO schema_migrations (filename, checksum)
          VALUES ($1, $2)
          `,
          [filename, checksum]
        );

        await client.query('COMMIT');
        appliedNow.push(filename);
        logger.info('Migration aplicada com sucesso', { filename });
      } catch (err) {
        await client.query('ROLLBACK');
        logger.error('Erro ao aplicar migration SQL', {
          filename,
          message: err.message,
          code: err.code
        });
        throw err;
      }
    }

    if (appliedNow.length === 0) {
      logger.info('Base de dados já se encontra atualizada. Nenhuma migration pendente.');
    }

    return {
      totalFiles: files.length,
      appliedCount: appliedNow.length,
      appliedFiles: appliedNow
    };
  } finally {
    try {
      await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]);
    } catch (_unlockErr) {
      // Ignorar falha de desbloqueio caso a ligação tenha sido encerrada
    }
    client.release();

    if (close) {
      await closePool();
    }
  }
}

if (require.main === module) {
  runMigrations({ close: true })
    .then((result) => {
      logger.info('Processo de migrations concluído', {
        appliedCount: result.appliedCount
      });
      process.exit(0);
    })
    .catch((err) => {
      logger.error('Falha crítica ao executar migrations', {
        message: err.message
      });
      process.exit(1);
    });
}

module.exports = {
  runMigrations,
  listMigrationFiles
};