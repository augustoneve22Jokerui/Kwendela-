'use strict';

const Joi = require('joi');

const participantItemSchema = Joi.object({
  fullName: Joi.string().min(2).max(140).required(),
  documentNumber: Joi.string().max(60).allow('', null),
  phone: Joi.string().max(40).allow('', null),
  emergencyContact: Joi.string().max(140).allow('', null),
  notes: Joi.string().max(400).allow('', null)
});

const createBookingSchema = {
  body: Joi.object({
    expeditionId: Joi.string().uuid().optional(),
    experienceId: Joi.string().uuid().optional(),
    scheduledDate: Joi.date().iso().optional(),
    participantsCount: Joi.number().integer().min(1).max(50).default(1),
    participants: Joi.array().items(participantItemSchema).max(50).default([]),
    specialRequests: Joi.string().max(1000).allow('', null),
    paymentMethod: Joi.string().valid('wallet', 'internal_demo').default('wallet'),
    idempotencyKey: Joi.string().min(8).max(120).optional()
  }).xor('expeditionId', 'experienceId')
};

const joinWaitlistSchema = {
  params: Joi.object({
    expeditionId: Joi.string().uuid().required()
  }),
  body: Joi.object({
    participantsCount: Joi.number().integer().min(1).max(20).default(1),
    notes: Joi.string().max(500).allow('', null)
  })
};

const confirmWaitlistSchema = {
  params: Joi.object({
    waitlistId: Joi.string().uuid().required()
  }),
  body: Joi.object({
    participants: Joi.array().items(participantItemSchema).max(20).default([]),
    specialRequests: Joi.string().max(1000).allow('', null),
    paymentMethod: Joi.string().valid('wallet', 'internal_demo').default('wallet'),
    idempotencyKey: Joi.string().min(8).max(120).optional()
  })
};

const cancelBookingSchema = {
  params: Joi.object({
    id: Joi.string().uuid().required()
  }),
  body: Joi.object({
    reason: Joi.string().max(500).allow('', null)
  })
};

const updateBookingStatusSchema = {
  params: Joi.object({
    id: Joi.string().uuid().required()
  }),
  body: Joi.object({
    status: Joi.string()
      .valid('confirmed', 'checked_in', 'completed', 'cancelled')
      .required(),
    reason: Joi.string().max(500).allow('', null)
  })
};

module.exports = {
  createBookingSchema,
  joinWaitlistSchema,
  confirmWaitlistSchema,
  cancelBookingSchema,
  updateBookingStatusSchema
};