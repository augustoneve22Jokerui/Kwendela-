'use strict';

const express = require('express');
const { authenticate } = require('../../middlewares/auth.middleware');
const { validate } = require('../../middlewares/validate.middleware');
const { uploadSingleImage } = require('../../middlewares/upload.middleware');
const { uploadLimiter } = require('../../middlewares/rateLimit.middleware');
const chatValidator = require('../../validators/chat.validator');
const { uuidParamSchema } = require('../../validators/admin.validator');
const chatController = require('../../controllers/api/chat.controller');

const router = express.Router();

router.use(authenticate());

router.get('/conversations', chatController.listConversations);

router.post(
  '/conversations',
  validate(chatValidator.createConversationSchema),
  chatController.createOrGetConversation
);

router.get(
  '/conversations/:id/messages',
  validate(uuidParamSchema),
  chatController.getConversationMessages
);

router.post(
  '/conversations/:id/messages',
  uploadLimiter,
  uploadSingleImage('attachment', 'chat'),
  validate(chatValidator.sendMessageSchema),
  chatController.sendMessage
);

router.patch(
  '/conversations/:id/read',
  validate(uuidParamSchema),
  chatController.markAsRead
);

router.post(
  '/conversations/:id/report',
  validate(chatValidator.reportConversationSchema),
  chatController.reportConversation
);

module.exports = router;