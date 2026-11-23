'use strict';

const { Pool } = require('pg');
const env = require('./env');
const logger = require('./logger');

const poolConfig = {
  connectionString: env.db.url,
  max: env.db.poolMax,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
};

if (env.db.ssl) {
  poolConfig.ssl = {
    rejectUnauthorized: false
  };
}

const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  logger.error('Erro inesperado no pool de ligações PostgreSQL', {
    message: err.message,
    code: err.code
  });
});

async function query(text, params = []) {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const durationMs = Date.now() - start;

    if (durationMs > 1000) {
      logger.warn('Consulta SQL lenta detetada', {
        durationMs,
        rowCount: result.rowCount
      });
    }

    return result;
  } catch (err) {
    logger.error('Erro ao executar consulta SQL', {
      message: err.message,
      code: err.code,
      detail: err.detail
    });
    throw err;
  }
}

async function getClient() {
  return pool.connect();
}

async function withTransaction(callback, options = {}) {
  const client = await pool.connect();
  try {
    if (options.isolationLevel) {
      const allowedLevels = ['READ COMMITTED', 'REPEATABLE READ', 'SERIALIZABLE'];
      if (!allowedLevels.includes(options.isolationLevel)) {
        throw new Error(`Nível de isolamento inválido: ${options.isolationLevel}`);
      }
      await client.query(`BEGIN ISOLATION LEVEL ${options.isolationLevel}`);
    } else {
      await client.query('BEGIN');
    }

    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      logger.error('Falha ao executar ROLLBACK da transação', {
        message: rollbackErr.message
      });
    }
    throw err;
  } finally {
    client.release();
  }
}

async function healthCheck() {
  const start = Date.now();
  await pool.query('SELECT 1 AS ok');
  return {
    status: 'up',
    latencyMs: Date.now() - start
  };
}

async function closePool() {
  await pool.end();
}

module.exports = {
  pool,
  query,
  getClient,
  withTransaction,
  healthCheck,
  closePool
};