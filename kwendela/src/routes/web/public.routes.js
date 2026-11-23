'use strict';

const express = require('express');
const { optionalAuth } = require('../../middlewares/auth.middleware');
const publicWebController = require('../../controllers/web/public.controller');

const router = express.Router();

router.use(optionalAuth);

router.get('/', publicWebController.renderHome);
router.get('/discover', publicWebController.renderDiscover);

router.get('/destinations', publicWebController.renderDestinations);
router.get('/destinations/:idOrSlug', publicWebController.renderDestinationDetail);

router.get('/experiences', publicWebController.renderExperiences);
router.get('/experiences/:idOrSlug', publicWebController.renderExperienceDetail);

router.get('/expeditions', publicWebController.renderExpeditions);
router.get('/expeditions/:idOrSlug', publicWebController.renderExpeditionDetail);

router.get('/booking/checkout', publicWebController.renderBookingCheckout);

module.exports = router;