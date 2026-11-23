'use strict';

class ApiError extends Error {
  constructor(statusCode, message, { code = 'INTERNAL_ERROR', details = null, isOperational = true } = {}) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message = 'Pedido inválido.', details = null, code = 'BAD_REQUEST') {
    return new ApiError(400, message, { code, details });
  }

  static unauthorized(message = 'Autenticação necessária.', code = 'UNAUTHORIZED') {
    return new ApiError(401, message, { code });
  }

  static forbidden(message = 'Não tem permissão para aceder a este recurso.', code = 'FORBIDDEN') {
    return new ApiError(403, message, { code });
  }

  static notFound(message = 'Recurso não encontrado.', code = 'NOT_FOUND') {
    return new ApiError(404, message, { code });
  }

  static conflict(message = 'Conflito com o estado atual do recurso.', code = 'CONFLICT', details = null) {
    return new ApiError(409, message, { code, details });
  }

  static unprocessable(message = 'Dados inválidos para processamento.', details = null, code = 'UNPROCESSABLE_ENTITY') {
    return new ApiError(422, message, { code, details });
  }

  static tooManyRequests(message = 'Demasiados pedidos. Tente novamente mais tarde.', code = 'RATE_LIMIT_EXCEEDED') {
    return new ApiError(429, message, { code });
  }

  static internal(message = 'Erro interno do servidor.', code = 'INTERNAL_ERROR') {
    return new ApiError(500, message, { code, isOperational: false });
  }
}

module.exports = ApiError;