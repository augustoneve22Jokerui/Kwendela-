'use strict';

const http = require('http');
const env = require('./config/env');
const logger = require('./config/logger');
const { healthCheck, closePool } = require('./config/database');
const { initSockets } = require('./sockets');
const { startJobs, stopJobs } = require('./jobs/scheduler');
const app = require('./app');

let server = null;
let isShuttingDown = false;

async function startServer() {
  try {
    if (env.db.url) {
      try {
        const dbStatus = await healthCheck();
        logger.info('Ligação PostgreSQL verificada com sucesso', {
          latencyMs: dbStatus.latencyMs
        });
      } catch (dbErr) {
        logger.warn('Aviso: base de dados indisponível no arranque inicial', {
          message: dbErr.message
        });
      }
    } else {
      logger.warn('DATABASE_URL não definida. Configure o ficheiro .env para ligar ao PostgreSQL.');
    }

    server = http.createServer(app);
    initSockets(server);

    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(env.port, '0.0.0.0', () => {
        server.removeListener('error', reject);
        resolve();
      });
    });

    startJobs();

    logger.info(`${env.appName} servidor iniciado com sucesso`, {
      env: env.nodeEnv,
      port: env.port,
      url: env.appUrl
    });

    return server;
  } catch (err) {
    logger.error('Falha crítica ao iniciar o servidor KWENDELA', {
      message: err.message,
      stack: err.stack
    });
    process.exit(1);
  }
}

async function shutdown(signal) {
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;

  logger.info(`Sinal ${signal} recebido. A encerrar graciosamente o servidor...`);

  try {
    stopJobs();

    if (server) {
      await new Promise((resolve) => {
        server.close(() => resolve());
      });
    }

    await closePool();
    logger.info('Servidor e pool PostgreSQL encerrados com sucesso.');
    process.exit(0);
  } catch (err) {
    logger.error('Erro durante o encerramento gracioso do servidor', {
      message: err.message
    });
    process.exit(1);
  }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('unhandledRejection', (reason) => {
  logger.error('Promessa rejeitada não tratada (unhandledRejection)', {
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined
  });
});

process.on('uncaughtException', (err) => {
  logger.error('Exceção síncrona não capturada (uncaughtException)', {
    message: err.message,
    stack: err.stack
  });
  shutdown('uncaughtException');
});

if (require.main === module) {
  startServer();
}

module.exports = {
  startServer,
  shutdown
};
