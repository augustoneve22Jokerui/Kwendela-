'use strict';

const multer = require('multer');
const env = require('../config/env');
const logger = require('../config/logger');
const ApiError = require('../utils/ApiError');
const { isApiRequest } = require('./auth.middleware');

function mapPostgresError(err) {
  if (!err || !err.code) {
    return null;
  }

  switch (err.code) {
    case '23505':
      return ApiError.conflict(
        'Já existe um registo com os mesmos dados únicos.',
        null,
        'DUPLICATE_ENTRY'
      );
    case '23503':
      return ApiError.badRequest(
        'Referência inválida para um registo relacionado.',
        null,
        'FOREIGN_KEY_VIOLATION'
      );
    case '23514':
      return ApiError.badRequest(
        'Os dados violam uma regra de integridade do sistema.',
        null,
        'CHECK_CONSTRAINT_VIOLATION'
      );
    case '22P02':
      return ApiError.badRequest(
        'Formato de identificador ou parâmetro inválido.',
        null,
        'INVALID_INPUT_FORMAT'
      );
    case '40P01':
      return ApiError.conflict(
        'Conflito temporário de concorrência. Tente novamente.',
        null,
        'CONCURRENCY_CONFLICT'
      );
    default:
      return null;
  }
}

function mapMulterError(err) {
  if (!(err instanceof multer.MulterError)) {
    return null;
  }

  switch (err.code) {
    case 'LIMIT_FILE_SIZE':
      return ApiError.badRequest(
        `O ficheiro excede o limite máximo permitido de ${env.upload.maxSizeMb} MB.`,
        null,
        'FILE_TOO_LARGE'
      );
    case 'LIMIT_FILE_COUNT':
      return ApiError.badRequest(
        'Número máximo de ficheiros excedido.',
        null,
        'TOO_MANY_FILES'
      );
    case 'LIMIT_UNEXPECTED_FILE':
      return ApiError.badRequest(
        'Campo de ficheiro inesperado no upload.',
        null,
        'UNEXPECTED_FILE_FIELD'
      );
    default:
      return ApiError.badRequest('Erro ao processar o ficheiro enviado.', null, 'UPLOAD_ERROR');
  }
}

function normalizeError(err) {
  if (err instanceof ApiError) {
    return err;
  }

  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return ApiError.badRequest('JSON inválido no corpo do pedido.', null, 'INVALID_JSON');
  }

  const multerMapped = mapMulterError(err);
  if (multerMapped) {
    return multerMapped;
  }

  const pgMapped = mapPostgresError(err);
  if (pgMapped) {
    return pgMapped;
  }

  if (err && err.statusCode && err.statusCode >= 400 && err.statusCode < 500) {
    return new ApiError(err.statusCode, err.message || 'Pedido inválido.', {
      code: err.code || 'BAD_REQUEST'
    });
  }

  return new ApiError(500, 'Ocorreu um erro interno no servidor.', {
    code: 'INTERNAL_ERROR',
    isOperational: false
  });
}

function notFoundHandler(req, res, next) {
  next(ApiError.notFound('O recurso solicitado não foi encontrado.', 'ROUTE_NOT_FOUND'));
}

function errorHandler(err, req, res, _next) {
  const normalized = normalizeError(err);

  if (normalized.statusCode >= 500 || !normalized.isOperational) {
    logger.error('Erro não tratado no servidor', {
      method: req.method,
      path: req.originalUrl,
      statusCode: normalized.statusCode,
      code: normalized.code,
      originalMessage: err && err.message,
      stack: err && err.stack
    });
  } else {
    logger.warn('Erro operacional no pedido', {
      method: req.method,
      path: req.originalUrl,
      statusCode: normalized.statusCode,
      code: normalized.code,
      message: normalized.message
    });
  }

  const publicMessage =
    normalized.statusCode >= 500 && env.isProduction
      ? 'Ocorreu um erro interno no servidor. Tente novamente mais tarde.'
      : normalized.message;

  if (isApiRequest(req)) {
    const payload = {
      success: false,
      code: normalized.code,
      message: publicMessage,
      timestamp: new Date().toISOString()
    };

    if (normalized.details) {
      payload.details = normalized.details;
    }

    if (!env.isProduction && normalized.statusCode >= 500 && err && err.stack) {
      payload.stack = err.stack;
    }

    return res.status(normalized.statusCode).json(payload);
  }

  const viewName =
    normalized.statusCode === 403
      ? 'pages/errors/403'
      : normalized.statusCode === 404
        ? 'pages/errors/404'
        : 'pages/errors/500';

  return res.status(normalized.statusCode).render(
    viewName,
    {
      layout: 'layouts/public',
      title: `Erro ${normalized.statusCode} — ${env.appName}`,
      statusCode: normalized.statusCode,
      message: publicMessage
    },
    (renderErr, html) => {
      if (renderErr) {
        return res
          .status(normalized.statusCode)
          .send(`<h1>Erro ${normalized.statusCode}</h1><p>${publicMessage}</p>`);
      }
      return res.send(html);
    }
  );
}

module.exports = {
  notFoundHandler,
  errorHandler
};