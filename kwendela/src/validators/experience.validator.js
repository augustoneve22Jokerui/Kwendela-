'use strict';

const Joi = require('joi');

const EXPERIENCE_CATEGORIES = [
  'nature',
  'culture',
  'adventure',
  'gastronomy',
  'city_tour',
  'safari',
  'beach',
  'heritage',
  'other'
];

const listExperiencesQuerySchema = {
  query: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(12),
    search: Joi.string().max(120).allow('', null),
    destinationId: Joi.string().uuid().optional(),
    companyId: Joi.string().uuid().optional(),
    province: Joi.string().max(100).allow('', null),
    category: Joi.string().valid(...EXPERIENCE_CATEGORIES).optional(),
    experienceType: Joi.string().valid('experience', 'tour').optional(),
    difficultyLevel: Joi.string().valid('easy', 'moderate', 'challenging', 'extreme').optional(),
    minPrice: Joi.number().min(0).optional(),
    maxPrice: Joi.number().min(0).optional(),
    sortBy: Joi.string()
      .valid('created_at', 'price_kz', 'rating_avg', 'duration_hours', 'title')
      .default('created_at'),
    sortOrder: Joi.string().valid('asc', 'desc', 'ASC', 'DESC').default('DESC')
  })
};

const createExperienceSchema = {
  body: Joi.object({
    destinationId: Joi.string().uuid().required(),
    title: Joi.string().min(3).max(180).required(),
    shortDescription: Joi.string().min(10).max(320).required(),
    description: Joi.string().min(20).max(8000).required(),
    category: Joi.string().valid(...EXPERIENCE_CATEGORIES).default('culture'),
    experienceType: Joi.string().valid('experience', 'tour').default('experience'),
    durationHours: Joi.number().min(0.5).max(720).precision(1).required(),
    priceKz: Joi.number().min(0).precision(2).required(),
    maxGroupSize: Joi.number().integer().min(1).max(200).default(15),
    difficultyLevel: Joi.string()
      .valid('easy', 'moderate', 'challenging', 'extreme')
      .default('moderate'),
    includes: Joi.array().items(Joi.string().max(160)).max(30).default([]),
    excludes: Joi.array().items(Joi.string().max(160)).max(30).default([]),
    requirements: Joi.array().items(Joi.string().max(200)).max(30).default([]),
    meetingPoint: Joi.string().max(300).allow('', null),
    languages: Joi.array().items(Joi.string().max(50)).min(1).default(['Português']),
    coverImageUrl: Joi.string().max(500).allow('', null),
    isActive: Joi.boolean().default(true)
  })
};

const updateExperienceSchema = {
  params: Joi.object({
    id: Joi.string().uuid().required()
  }),
  body: Joi.object({
    destinationId: Joi.string().uuid().optional(),
    title: Joi.string().min(3).max(180).optional(),
    shortDescription: Joi.string().min(10).max(320).optional(),
    description: Joi.string().min(20).max(8000).optional(),
    category: Joi.string().valid(...EXPERIENCE_CATEGORIES).optional(),
    experienceType: Joi.string().valid('experience', 'tour').optional(),
    durationHours: Joi.number().min(0.5).max(720).precision(1).optional(),
    priceKz: Joi.number().min(0).precision(2).optional(),
    maxGroupSize: Joi.number().integer().min(1).max(200).optional(),
    difficultyLevel: Joi.string()
      .valid('easy', 'moderate', 'challenging', 'extreme')
      .optional(),
    includes: Joi.array().items(Joi.string().max(160)).max(30).optional(),
    excludes: Joi.array().items(Joi.string().max(160)).max(30).optional(),
    requirements: Joi.array().items(Joi.string().max(200)).max(30).optional(),
    meetingPoint: Joi.string().max(300).allow('', null),
    languages: Joi.array().items(Joi.string().max(50)).min(1).optional(),
    coverImageUrl: Joi.string().max(500).allow('', null),
    isActive: Joi.boolean().optional()
  }).min(1)
};

const addExperienceMediaSchema = {
  params: Joi.object({
    id: Joi.string().uuid().required()
  }),
  body: Joi.object({
    mediaType: Joi.string().valid('image', 'video').default('image'),
    url: Joi.string().max(500).optional(),
    caption: Joi.string().max(255).allow('', null),
    isCover: Joi.boolean().default(false),
    displayOrder: Joi.number().integer().min(0).max(100).default(0)
  })
};

module.exports = {
  EXPERIENCE_CATEGORIES,
  listExperiencesQuerySchema,
  createExperienceSchema,
  updateExperienceSchema,
  addExperienceMediaSchema
};