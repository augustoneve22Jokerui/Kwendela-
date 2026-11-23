'use strict';

const Joi = require('joi');

const timePattern = /^([01]\d|2[0-3]):([0-5]\d)$/;

const listExpeditionsQuerySchema = {
  query: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(12),
    search: Joi.string().max(120).allow('', null),
    destinationId: Joi.string().uuid().optional(),
    companyId: Joi.string().uuid().optional(),
    status: Joi.string()
      .valid('draft', 'published', 'open', 'full', 'in_progress', 'completed', 'cancelled')
      .optional(),
    startDateFrom: Joi.date().iso().optional(),
    startDateTo: Joi.date().iso().optional(),
    minPrice: Joi.number().min(0).optional(),
    maxPrice: Joi.number().min(0).optional(),
    hasAvailability: Joi.boolean().optional(),
    sortBy: Joi.string()
      .valid('start_date', 'price_per_participant', 'created_at', 'max_capacity')
      .default('start_date'),
    sortOrder: Joi.string().valid('asc', 'desc', 'ASC', 'DESC').default('ASC')
  })
};

const createExpeditionSchema = {
  body: Joi.object({
    experienceId: Joi.string().uuid().allow(null),
    destinationId: Joi.string().uuid().required(),
    guideId: Joi.string().uuid().allow(null),
    transportId: Joi.string().uuid().allow(null),
    routeId: Joi.string().uuid().allow(null),
    title: Joi.string().min(3).max(180).required(),
    description: Joi.string().min(10).max(5000).required(),
    minCapacity: Joi.number().integer().min(1).max(500).default(1),
    maxCapacity: Joi.number().integer().min(Joi.ref('minCapacity')).max(1000).required(),
    pricePerParticipant: Joi.number().min(0).precision(2).required(),
    startDate: Joi.date().iso().required(),
    endDate: Joi.date().iso().min(Joi.ref('startDate')).required(),
    departureTime: Joi.string().pattern(timePattern).allow('', null),
    meetingPoint: Joi.string().max(300).allow('', null),
    conditions: Joi.string().max(3000).allow('', null),
    cancellationPolicy: Joi.string().max(1500).allow('', null),
    waitlistEnabled: Joi.boolean().default(true),
    status: Joi.string().valid('draft', 'published', 'open').default('open'),
    coverImageUrl: Joi.string().max(500).allow('', null)
  })
};

const updateExpeditionSchema = {
  params: Joi.object({
    id: Joi.string().uuid().required()
  }),
  body: Joi.object({
    experienceId: Joi.string().uuid().allow(null),
    destinationId: Joi.string().uuid().optional(),
    guideId: Joi.string().uuid().allow(null),
    transportId: Joi.string().uuid().allow(null),
    routeId: Joi.string().uuid().allow(null),
    title: Joi.string().min(3).max(180).optional(),
    description: Joi.string().min(10).max(5000).optional(),
    minCapacity: Joi.number().integer().min(1).max(500).optional(),
    maxCapacity: Joi.number().integer().min(1).max(1000).optional(),
    pricePerParticipant: Joi.number().min(0).precision(2).optional(),
    startDate: Joi.date().iso().optional(),
    endDate: Joi.date().iso().optional(),
    departureTime: Joi.string().pattern(timePattern).allow('', null),
    meetingPoint: Joi.string().max(300).allow('', null),
    conditions: Joi.string().max(3000).allow('', null),
    cancellationPolicy: Joi.string().max(1500).allow('', null),
    waitlistEnabled: Joi.boolean().optional(),
    status: Joi.string()
      .valid('draft', 'published', 'open', 'full', 'in_progress', 'completed', 'cancelled')
      .optional(),
    coverImageUrl: Joi.string().max(500).allow('', null)
  }).min(1)
};

module.exports = {
  listExpeditionsQuerySchema,
  createExpeditionSchema,
  updateExpeditionSchema
};