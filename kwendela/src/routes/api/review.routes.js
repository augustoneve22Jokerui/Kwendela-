'use strict';

const express = require('express');
const { authenticate } = require('../../middlewares/auth.middleware');
const { requireCompanyPortalUser } = require('../../middlewares/rbac.middleware');
const { requireCompanyAccess } = require('../../middlewares/companyAccess.middleware');
const { validate } = require('../../middlewares/validate.middleware');
const reviewValidator = require('../../validators/review.validator');
const { uuidParamSchema } = require('../../validators/admin.validator');
const reviewController = require('../../controllers/api/review.controller');

const router = express.Router();

router.get(
  '/',
  validate(reviewValidator.listReviewsQuerySchema),
  reviewController.listPublic
);

router.get('/me', authenticate(), reviewController.listMyReviews);

router.post(
  '/',
  authenticate(),
  validate(reviewValidator.createReviewSchema),
  reviewController.createReview
);

router.patch(
  '/:id',
  authenticate(),
  validate(reviewValidator.updateReviewSchema),
  reviewController.updateReview
);

router.delete(
  '/:id',
  authenticate(),
  validate(uuidParamSchema),
  reviewController.deleteReview
);

router.post(
  '/:id/reply',
  authenticate(),
  requireCompanyPortalUser,
  requireCompanyAccess({ allowedCompanyRoles: ['owner', 'admin', 'manager'] }),
  validate(reviewValidator.replyReviewSchema),
  reviewController.replyReview
);

module.exports = router;