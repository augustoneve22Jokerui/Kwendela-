'use strict';

const Joi = require('joi');

const createConversationSchema = {
  body: Joi.object({
    companyId: Joi.string().uuid().optional(),
    recipientUserId: Joi.string().uuid().optional(),
    bookingId: Joi.string().uuid().optional(),
    conversationType: Joi.string()
      .valid('tourist_company', 'company_guide', 'booking_support')
      .default('tourist_company'),
    subject: Joi.string().max(160).allow('', null),
    initialMessage: Joi.string().min(1).max(2000).optional()
  }).or('companyId', 'recipientUserId', 'bookingId')
};

const sendMessageSchema = {
  params: Joi.object({
    id: Joi.string().uuid().required()
  }),
  body: Joi.object({
    content: Joi.string().min(1).max(3000).allow('', null),
    messageType: Joi.string().valid('text', 'image', 'file', 'location').default('text'),
    attachmentUrl: Joi.string().max(500).allow('', null),
    metadata: Joi.object().unknown(true).optional()
  }).or('content', 'attachmentUrl')
};

const reportConversationSchema = {
  params: Joi.object({
    id: Joi.string().uuid().required()
  }),
  body: Joi.object({
    reason: Joi.string()
      .valid('harassment', 'fraud', 'spam', 'inappropriate', 'safety', 'other')
      .required(),
    description: Joi.string().min(5).max(1500).required()
  })
};

module.exports = {
  createConversationSchema,
  sendMessageSchema,
  reportConversationSchema
};