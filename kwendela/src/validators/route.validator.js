'use strict';

const Joi = require('joi');

const waypointItemSchema = Joi.object({
  title: Joi.string().min(2).max(160).required(),
  description: Joi.string().max(1000).allow('', null),
  waypointType: Joi.string()
    .valid('start', 'stop', 'poi', 'viewpoint', 'meal', 'lodging', 'end')
    .default('poi'),
  latitude: Joi.number().min(-90).max(90).required(),
  longitude: Joi.number().min(-180).max(180).required(),
  stopOrder: Joi.number().integer().min(0).max(500).required(),
  estimatedMinutesAtStop: Joi.number().integer().min(0).max(10080).default(15),
  scheduledTime: Joi.string().max(40).allow('', null)
});

const itineraryDaySchema = Joi.object({
  dayNumber: Joi.number().integer().min(1).max(60).required(),
  title: Joi.string().min(2).max(160).required(),
  summary: Joi.string().max(2000).allow('', null),
  activities: Joi.array().items(Joi.string().max(300)).max(30).default([])
});

const createRouteSchema = {
  body: Joi.object({
    title: Joi.string().min(3).max(180).required(),
    description: Joi.string().max(3000).allow('', null),
    destinationId: Joi.string().uuid().allow(null),
    transportMode: Joi.string()
      .valid('driving', 'walking', '4x4', 'boat', 'mixed')
      .default('driving'),
    isPublic: Joi.boolean().default(false),
    waypoints: Joi.array().items(waypointItemSchema).min(2).max(50).required(),
    itineraryDays: Joi.array().items(itineraryDaySchema).max(60).default([])
  })
};

const updateRouteSchema = {
  params: Joi.object({
    id: Joi.string().uuid().required()
  }),
  body: Joi.object({
    title: Joi.string().min(3).max(180).optional(),
    description: Joi.string().max(3000).allow('', null),
    destinationId: Joi.string().uuid().allow(null),
    transportMode: Joi.string()
      .valid('driving', 'walking', '4x4', 'boat', 'mixed')
      .optional(),
    isPublic: Joi.boolean().optional(),
    waypoints: Joi.array().items(waypointItemSchema).min(2).max(50).optional(),
    itineraryDays: Joi.array().items(itineraryDaySchema).max(60).optional()
  }).min(1)
};

const addWaypointSchema = {
  params: Joi.object({
    id: Joi.string().uuid().required()
  }),
  body: waypointItemSchema
};

const trackingPointSchema = Joi.object({
  latitude: Joi.number().min(-90).max(90).required(),
  longitude: Joi.number().min(-180).max(180).required(),
  accuracyMeters: Joi.number().min(0).max(10000).allow(null),
  speedKmh: Joi.number().min(0).max(500).allow(null),
  heading: Joi.number().min(0).max(360).allow(null),
  recordedAt: Joi.date().iso().optional()
});

const recordTrackingPositionSchema = {
  params: Joi.object({
    expeditionId: Joi.string().uuid().required()
  }),
  body: Joi.object({
    latitude: Joi.number().min(-90).max(90).required(),
    longitude: Joi.number().min(-180).max(180).required(),
    accuracyMeters: Joi.number().min(0).max(10000).allow(null),
    speedKmh: Joi.number().min(0).max(500).allow(null),
    heading: Joi.number().min(0).max(360).allow(null),
    recordedAt: Joi.date().iso().optional(),
    consentGranted: Joi.boolean().valid(true).required().messages({
      'any.only': 'É obrigatório o consentimento explícito para partilha de localização.'
    })
  })
};

const syncOfflineTrackingSchema = {
  params: Joi.object({
    expeditionId: Joi.string().uuid().required()
  }),
  body: Joi.object({
    consentGranted: Joi.boolean().valid(true).required(),
    points: Joi.array().items(trackingPointSchema).min(1).max(200).required()
  })
};

module.exports = {
  createRouteSchema,
  updateRouteSchema,
  addWaypointSchema,
  recordTrackingPositionSchema,
  syncOfflineTrackingSchema
};