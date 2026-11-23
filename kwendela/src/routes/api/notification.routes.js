'use strict';

const express = require('express');
const { authenticate } = require('../../middlewares/auth.middleware');
const { validate } = require('../../middlewares/validate.middleware');
const { uuidParamSchema } = require('../../validators/admin.validator');
const notificationController = require('../../controllers/api/notification.controller');

const router = express.Router();

router.use(authenticate());

router.get('/', notificationController.listMyNotifications);
router.get('/unread-count', notificationController.getUnreadCount);
router.patch('/read-all', notificationController.markAllAsRead);
router.patch(
  '/:id/read',
  validate(uuidParamSchema),
  notificationController.markAsRead
);

module.exports = router;