'use strict';

const Joi = require('joi');
const xss = require('xss');
const ApiError = require('../utils/ApiError');

const SKIP_XSS_KEYS = new Set([
  'password',
  'currentPassword',
  'newPassword',
  'confirmPassword',
  'token',
  'refreshToken'
]);

function sanitizeValue(value, key = '') {
  if (SKIP_XSS_KEYS.has(key)) {
    return value;
  }

  if (typeof value === 'string') {
    return xss(value.trim());
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item));
  }

  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const cleaned = {};
    for (const [k, v] of Object.entries(value)) {
      cleaned[k] = sanitizeValue(v, k);
    }
    return cleaned;
  }

  return value;
}

function validate(schemaOrMap, target = 'body') {
  return function validateMiddleware(req, _res, next) {
    const schemas = Joi.isSchema(schemaOrMap)
      ? { [target]: schemaOrMap }
      : schemaOrMap || {};

    const errors = [];

    for (const section of ['params', 'query', 'body']) {
      const schema = schemas[section];
      if (!schema) {
        continue;
      }

      const { error, value } = schema.validate(req[section] || {}, {
        abortEarly: false,
        stripUnknown: true,
        convert: true
      });

      if (error) {
        for (const detail of error.details) {
          errors.push({
            location: section,
            field: detail.path.join('.') || section,
            message: detail.message.replace(/"/g, "'")
          });
        }
      } else {
        req[section] = sanitizeValue(value);
      }
    }

    if (errors.length > 0) {
      return next(
        ApiError.badRequest('Existem erros de validação nos dados enviados.', errors, 'VALIDATION_ERROR')
      );
    }

    return next();
  };
}

module.exports = {
  validate,
  sanitizeValue
};