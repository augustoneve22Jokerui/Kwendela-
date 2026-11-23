'use strict';

const express = require('express');
const Joi = require('joi');
const { authenticate } = require('../../middlewares/auth.middleware');
const { validate } = require('../../middlewares/validate.middleware');
const routeValidator = require('../../validators/route.validator');
const trackingController = require('../../controllers/api/tracking.controller');

const expeditionIdParamSchema = {
  params: Joi.object({
    expeditionId: Joi.string().uuid().required()
  })
};

const router = express.Router();

router.use(authenticate());

router.post(
  '/expeditions/:expeditionId/positions',
  validate(routeValidator.recordTrackingPositionSchema),
  trackingController.recordPosition
);

router.post(
  '/expeditions/:expeditionId/stop',
  validate(expeditionIdParamSchema),
  trackingController.stopSharing
);

router.post(
  '/expeditions/:expeditionId/sync',
  validate(routeValidator.syncOfflineTrackingSchema),
  trackingController.syncOfflinePositions
);

router.get(
  '/expeditions/:expeditionId/history',
  validate(expeditionIdParamSchema),
  trackingController.getExpeditionHistory
);

module.exports = router;