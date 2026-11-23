'use strict';

const express = require('express');
const { generalApiLimiter } = require('../../middlewares/rateLimit.middleware');

const healthRoutes = require('./health.routes');
const authRoutes = require('./auth.routes');
const adminRoutes = require('./admin.routes');
const companyRoutes = require('./company.routes');
const planRoutes = require('./plan.routes');
const destinationRoutes = require('./destination.routes');
const experienceRoutes = require('./experience.routes');
const expeditionRoutes = require('./expedition.routes');
const bookingRoutes = require('./booking.routes');
const routeRoutes = require('./route.routes');
const trackingRoutes = require('./tracking.routes');
const walletRoutes = require('./wallet.routes');
const chatRoutes = require('./chat.routes');
const notificationRoutes = require('./notification.routes');
const reviewRoutes = require('./review.routes');
const reportRoutes = require('./report.routes');
const userRoutes = require('./user.routes');

const router = express.Router();

router.use('/health', healthRoutes);

router.use(generalApiLimiter);

router.use('/auth', authRoutes);
router.use('/admin', adminRoutes);
router.use('/company', companyRoutes);
router.use('/plans', planRoutes);
router.use('/destinations', destinationRoutes);
router.use('/experiences', experienceRoutes);
router.use('/expeditions', expeditionRoutes);
router.use('/bookings', bookingRoutes);
router.use('/routes', routeRoutes);
router.use('/tracking', trackingRoutes);
router.use('/wallet', walletRoutes);
router.use('/chat', chatRoutes);
router.use('/notifications', notificationRoutes);
router.use('/reviews', reviewRoutes);
router.use('/reports', reportRoutes);
router.use('/users', userRoutes);

module.exports = router;