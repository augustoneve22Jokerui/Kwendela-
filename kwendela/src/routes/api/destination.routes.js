'use strict';

const express = require('express');
const { authenticate, optionalAuth } = require('../../middlewares/auth.middleware');
const { requireCompanyPortalUser } = require('../../middlewares/rbac.middleware');
const { requireCompanyAccess } = require('../../middlewares/companyAccess.middleware');
const { checkPlanLimit } = require('../../middlewares/planLimit.middleware');
const { uploadLimiter } = require('../../middlewares/rateLimit.middleware');
const { uploadSingleImage, uploadSingleMedia } = require('../../middlewares/upload.middleware');
const { validate } = require('../../middlewares/validate.middleware');
const destinationValidator = require('../../validators/destination.validator');
const { uuidParamSchema } = require('../../validators/admin.validator');
const destinationController = require('../../controllers/api/destination.controller');

const router = express.Router();

router.get(
  '/',
  validate(destinationValidator.listDestinationsQuerySchema),
  destinationController.listPublic
);

router.get('/provinces', destinationController.listProvinces);

router.get(
  '/company',
  authenticate(),
  requireCompanyPortalUser,
  requireCompanyAccess(),
  destinationController.listCompanyDestinations
);

router.post(
  '/company',
  authenticate(),
  requireCompanyPortalUser,
  requireCompanyAccess({ allowedCompanyRoles: ['owner', 'admin', 'manager'] }),
  checkPlanLimit('destinations'),
  uploadLimiter,
  uploadSingleImage('coverImage', 'destinations'),
  validate(destinationValidator.createDestinationSchema),
  destinationController.createCompanyDestination
);

router.patch(
  '/company/:id',
  authenticate(),
  requireCompanyPortalUser,
  requireCompanyAccess({ allowedCompanyRoles: ['owner', 'admin', 'manager'] }),
  uploadLimiter,
  uploadSingleImage('coverImage', 'destinations'),
  validate(destinationValidator.updateDestinationSchema),
  destinationController.updateCompanyDestination
);

router.delete(
  '/company/:id',
  authenticate(),
  requireCompanyPortalUser,
  requireCompanyAccess({ allowedCompanyRoles: ['owner', 'admin', 'manager'] }),
  validate(uuidParamSchema),
  destinationController.deleteCompanyDestination
);

router.post(
  '/company/:id/media',
  authenticate(),
  requireCompanyPortalUser,
  requireCompanyAccess({ allowedCompanyRoles: ['owner', 'admin', 'manager'] }),
  uploadLimiter,
  uploadSingleMedia('media', 'destinations'),
  validate(destinationValidator.addDestinationMediaSchema),
  destinationController.addMedia
);

router.delete(
  '/company/:id/media/:mediaId',
  authenticate(),
  requireCompanyPortalUser,
  requireCompanyAccess({ allowedCompanyRoles: ['owner', 'admin', 'manager'] }),
  destinationController.removeMedia
);

router.post(
  '/:id/favorite',
  authenticate(),
  validate(uuidParamSchema),
  destinationController.toggleFavorite
);

router.get('/:idOrSlug', optionalAuth, destinationController.getPublicDetail);

module.exports = router;