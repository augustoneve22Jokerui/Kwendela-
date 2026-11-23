'use strict';

const Joi = require('joi');

const listReviewsQuerySchema = {
  query: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(12),
    targetType: Joi.string().valid('destination', 'experience', 'company').optional(),
    targetId: Joi.string().uuid().optional(),
    minRating: Joi.number().integer().min(1).max(5).optional()
  })
};

const createReviewSchema = {
  body: Joi.object({
    targetType: Joi.string().valid('destination', 'experience', 'company').required(),
    targetId: Joi.string().uuid().required(),
    bookingId: Joi.string().uuid().allow(null),
    rating: Joi.number().integer().min(1).max(5).required(),
    title: Joi.string().min(2).max(140).allow('', null),
    comment: Joi.string().min(5).max(2000).required()
  })
};

const updateReviewSchema = {
  params: Joi.object({
    id: Joi.string().uuid().required()
  }),
  body: Joi.object({
    rating: Joi.number().integer().min(1).max(5).optional(),
    title: Joi.string().min(2).max(140).allow('', null),
    comment: Joi.string().min(5).max(2000).optional()
  }).min(1)
};

const replyReviewSchema = {
  params: Joi.object({
    id: Joi.string().uuid().required()
  }),
  body: Joi.object({
    companyReply: Joi.string().min(2).max(1500).required()
  })
};

module.exports = {
  listReviewsQuerySchema,
  createReviewSchema,
  updateReviewSchema,
  replyReviewSchema
};