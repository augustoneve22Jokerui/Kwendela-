'use strict';

const express = require('express');
const { authenticate } = require('../../middlewares/auth.middleware');
const { requireCompanyAccess } = require('../../middlewares/companyAccess.middleware');
const { financialLimiter } = require('../../middlewares/rateLimit.middleware');
const { validate } = require('../../middlewares/validate.middleware');
const bookingValidator = require('../../validators/booking.validator');
const { uuidParamSchema } = require('../../validators/admin.validator');
const bookingController = require('../../controllers/api/booking.controller');

const router = express.Router();

router.use(authenticate());

router.post(
  '/',
  financialLimiter,
  validate(bookingValidator.createBookingSchema),
  bookingController.createBooking
);

router.get('/me', bookingController.listMyBookings);
router.get('/waitlist/me', bookingController.listMyWaitlist);

router.post(
  '/expeditions/:expeditionId/waitlist',
  validate(bookingValidator.joinWaitlistSchema),
  bookingController.joinWaitlist
);

router.post(
  '/waitlist/:waitlistId/confirm',
  financialLimiter,
  validate(bookingValidator.confirmWaitlistSchema),
  bookingController.confirmWaitlistSpot
);

router.get(
  '/company',
  requireCompanyAccess(),
  bookingController.listCompanyBookings
);

router.patch(
  '/company/:id/status',
  requireCompanyAccess({ allowedCompanyRoles: ['owner', 'admin', 'manager', 'staff'] }),
  validate(bookingValidator.updateBookingStatusSchema),
  bookingController.updateCompanyBookingStatus
);

router.get(
  '/company/expeditions/:expeditionId/waitlist',
  requireCompanyAccess(),
  bookingController.listExpeditionWaitlist
);

router.get(
  '/:id',
  validate(uuidParamSchema),
  bookingController.getBookingDetails
);

router.post(
  '/:id/cancel',
  financialLimiter,
  validate(bookingValidator.cancelBookingSchema),
  bookingController.cancelBooking
);

module.exports = router;