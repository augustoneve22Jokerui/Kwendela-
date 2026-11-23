'use strict';

const express = require('express');
const { authenticate, optionalAuth } = require('../../middlewares/auth.middleware');
const { authLimiter } = require('../../middlewares/rateLimit.middleware');
const { sanitizeValue } = require('../../middlewares/validate.middleware');
const authValidator = require('../../validators/auth.validator');
const authWebController = require('../../controllers/web/auth.controller');

const router = express.Router();

function validateWebForm(schemaMap, redirectPath) {
  return function webFormValidationMiddleware(req, res, next) {
    if (!schemaMap || !schemaMap.body) {
      return next();
    }

    const nextUrl = req.body && typeof req.body.next === 'string' ? req.body.next : '';

    const { error, value } = schemaMap.body.validate(req.body || {}, {
      abortEarly: false,
      stripUnknown: true,
      convert: true
    });

    if (error) {
      const firstMessage = error.details[0]
        ? error.details[0].message.replace(/"/g, "'")
        : 'Dados do formulário inválidos.';

      res.cookie('kwendela_flash', JSON.stringify({ error: firstMessage }), {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 1000
      });

      return res.redirect(redirectPath);
    }

    req.body = sanitizeValue(value);
    if (nextUrl) {
      req.body.next = nextUrl;
    }

    return next();
  };
}

router.get('/login', optionalAuth, authWebController.renderLogin);
router.post(
  '/login',
  authLimiter,
  validateWebForm(authValidator.loginSchema, '/auth/login'),
  authWebController.handleWebLogin
);

router.get('/register', optionalAuth, authWebController.renderRegister);
router.post(
  '/register',
  authLimiter,
  validateWebForm(authValidator.registerSchema, '/auth/register'),
  authWebController.handleWebRegister
);

router.get('/forgot-password', optionalAuth, authWebController.renderForgotPassword);
router.get('/reset-password', optionalAuth, authWebController.renderResetPassword);

router.get(
  '/force-change-password',
  authenticate({ allowMustChangePassword: true }),
  authWebController.renderForceChangePassword
);
router.post(
  '/force-change-password',
  authenticate({ allowMustChangePassword: true }),
  authLimiter,
  validateWebForm(authValidator.changePasswordSchema, '/auth/force-change-password'),
  authWebController.handleWebForceChangePassword
);

router.post('/logout', optionalAuth, authWebController.handleWebLogout);

module.exports = router;