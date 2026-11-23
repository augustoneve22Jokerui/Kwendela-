'use strict';

const express = require('express');
const { authenticate } = require('../../middlewares/auth.middleware');
const touristWebController = require('../../controllers/web/tourist.controller');

const router = express.Router();

router.use(authenticate());

router.get('/', (_req, res) => res.redirect('/tourist/trips'));
router.get('/profile', touristWebController.renderProfile);
router.get('/trips', touristWebController.renderTrips);
router.get('/favorites', touristWebController.renderFavorites);
router.get('/wallet', touristWebController.renderWallet);
router.get('/premium', touristWebController.renderPremium);
router.get('/notifications', touristWebController.renderNotifications);
router.get('/chat', touristWebController.renderChat);
router.get('/reviews', touristWebController.renderReviews);
router.get('/tracking', touristWebController.renderTracking);

module.exports = router;