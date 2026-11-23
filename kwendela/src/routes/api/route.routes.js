'use strict';

const express = require('express');
const { authenticate, optionalAuth } = require('../../middlewares/auth.middleware');
const { validate } = require('../../middlewares/validate.middleware');
const routeValidator = require('../../validators/route.validator');
const { uuidParamSchema } = require('../../validators/admin.validator');
const routeController = require('../../controllers/api/route.controller');

const router = express.Router();

router.get('/', optionalAuth, routeController.listRoutes);

router.get(
  '/:id',
  optionalAuth,
  validate(uuidParamSchema),
  routeController.getRouteById
);

router.post(
  '/',
  authenticate(),
  validate(routeValidator.createRouteSchema),
  routeController.createRoute
);

router.patch(
  '/:id',
  authenticate(),
  validate(routeValidator.updateRouteSchema),
  routeController.updateRoute
);

router.post(
  '/:id/waypoints',
  authenticate(),
  validate(routeValidator.addWaypointSchema),
  routeController.addWaypoint
);

router.delete(
  '/:id',
  authenticate(),
  validate(uuidParamSchema),
  routeController.deleteRoute
);

module.exports = router;