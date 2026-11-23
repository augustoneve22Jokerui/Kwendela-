'use strict';

const Joi = require('joi');

const listDestinationsQuerySchema = {
  query: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(12),
    search: Joi.string().max(120).allow('', null),
    province: Joi.string().max(100).allow('', null),
    country: Joi.string().max(80).allow('', null),
    category: Joi.string().max(60).allow('', null),
    featured: Joi.boolean().optional(),
    sortBy: Joi.string().valid('created_at', 'name', 'rating_avg', 'views_count').default('created_at'),
    sortOrder: Joi.string().valid('asc', 'desc', 'ASC', 'DESC').default('DESC')
  })
};

const createDestinationSchema = {
  body: Joi.object({
    name: Joi.string().min(2).max(160).required(),
    country: Joi.string().min(2).max(80).default('Angola'),
    province: Joi.string().min(2).max(100).required(),
    municipality: Joi.string().max(100).allow('', null),
    category: Joi.string()
      .valid('nature', 'culture', 'adventure', 'gastronomy', 'city_tour', 'safari', 'beach', 'heritage', 'other')
      .default('nature'),
    shortDescription: Joi.string().min(10).max(320).required(),
    description: Joi.string().min(20).max(8000).required(),
    latitude: Joi.number().min(-90).max(90).required(),
    longitude: Joi.number().min(-180).max(180).required(),
    bestSeason: Joi.string().max(160).allow('', null),
    highlights: Joi.array().items(Joi.string().max(160)).max(20).default([]),
    practicalInfo: Joi.object().unknown(true).default({}),
    coverImageUrl: Joi.string().max(500).allow('', null)
  })
};

const updateDestinationSchema = {
  params: Joi.object({
    id: Joi.string().uuid().required()
  }),
  body: Joi.object({
    name: Joi.string().min(2).max(160).optional(),
    country: Joi.string().min(2).max(80).optional(),
    province: Joi.string().min(2).max(100).optional(),
    municipality: Joi.string().max(100).allow('', null),
    category: Joi.string()
      .valid('nature', 'culture', 'adventure', 'gastronomy', 'city_tour', 'safari', 'beach', 'heritage', 'other')
      .optional(),
    shortDescription: Joi.string().min(10).max(320).optional(),
    description: Joi.string().min(20).max(8000).optional(),
    latitude: Joi.number().min(-90).max(90).optional(),
    longitude: Joi.number().min(-180).max(180).optional(),
    bestSeason: Joi.string().max(160).allow('', null),
    highlights: Joi.array().items(Joi.string().max(160)).max(20).optional(),
    practicalInfo: Joi.object().unknown(true).optional(),
    coverImageUrl: Joi.string().max(500).allow('', null)
  }).min(1)
};

const addDestinationMediaSchema = {
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
  listDestinationsQuerySchema,
  createDestinationSchema,
  updateDestinationSchema,
  addDestinationMediaSchema
};