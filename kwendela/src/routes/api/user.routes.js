'use strict';

const express = require('express');
const { authenticate } = require('../../middlewares/auth.middleware');
const { validate } = require('../../middlewares/validate.middleware');
const { uploadSingleImage } = require('../../middlewares/upload.middleware');
const { uploadLimiter } = require('../../middlewares/rateLimit.middleware');
const authValidator = require('../../validators/auth.validator');
const userController = require('../../controllers/api/user.controller');

const router = express.Router();

router.use(authenticate());

router.get('/me', userController.getMyProfile);

router.patch(
  '/me',
  validate(authValidator.updateProfileSchema),
  userController.updateMyProfile
);

router.post(
  '/me/avatar',
  uploadLimiter,
  uploadSingleImage('avatar', 'avatars'),
  userController.updateMyAvatar
);

router.get('/me/favorites', userController.listMyFavorites);

router.get('/me/trips', userController.getMyTripsSummary);

module.exports = router;