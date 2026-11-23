'use strict';

const { healthCheck } = require('../../config/database');
const env = require('../../config/env');
const ApiResponse = require('../../utils/ApiResponse');

async function getHealth(_req, res) {
  try {
    const dbStatus = await healthCheck();

    return ApiResponse.success(
      res,
      {
        status: 'ok',
        service: env.appName,
        environment: env.nodeEnv,
        uptimeSeconds: Math.floor(process.uptime()),
        database: dbStatus
      },
      'Serviço operacional.'
    );
  } catch (_err) {
    return res.status(503).json({
      success: false,
      code: 'SERVICE_UNAVAILABLE',
      message: 'Serviço temporariamente degradado: base de dados indisponível.',
      data: {
        status: 'degraded',
        service: env.appName,
        environment: env.nodeEnv,
        database: { status: 'down' }
      },
      timestamp: new Date().toISOString()
    });
  }
}

module.exports = {
  getHealth
};