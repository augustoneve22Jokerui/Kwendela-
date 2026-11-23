'use strict';

const express = require('express');
const { authenticate } = require('../../middlewares/auth.middleware');
const { authLimiter } = require('../../middlewares/rateLimit.middleware');
const { validate } = require('../../middlewares/validate.middleware');
const authValidator = require('../../validators/auth.validator');
const authController = require('../../controllers/api/auth.controller');

const router = express.Router();

router.post(
  '/register',
  authLimiter,
  validate(authValidator.registerSchema),
  authController.register
);

router.post(
  '/login',
  authLimiter,
  validate(authValidator.loginSchema),
  authController.login
);

router.post(
  '/refresh',
  authLimiter,
  validate(authValidator.refreshTokenSchema),
  authController.refresh
);

router.post('/logout', authController.logout);

router.get(
  '/me',
  authenticate({ allowMustChangePassword: true }),
  authController.me
);

router.post(
  '/forgot-password',
  authLimiter,
  validate(authValidator.forgotPasswordSchema),
  authController.forgotPassword
);

router.post(
  '/reset-password',
  authLimiter,
  validate(authValidator.resetPasswordSchema),
  authController.resetPassword
);

router.post(
  '/change-password',
  authenticate({ allowMustChangePassword: true }),
  validate(authValidator.changePasswordSchema),
  authController.changePassword
);

module.exports = router;