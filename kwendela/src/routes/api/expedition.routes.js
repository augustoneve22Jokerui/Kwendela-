'use strict';

const express = require('express');
const { authenticate, optionalAuth } = require('../../middlewares/auth.middleware');
const { requireCompanyPortalUser } = require('../../middlewares/rbac.middleware');
const { requireCompanyAccess } = require('../../middlewares/companyAccess.middleware');
const { checkPlanLimit } = require('../../middlewares/planLimit.middleware');
const { uploadLimiter } = require('../../middlewares/rateLimit.middleware');
const { uploadSingleImage } = require('../../middlewares/upload.middleware');
const { validate } = require('../../middlewares/validate.middleware');
const expeditionValidator = require('../../validators/expedition.validator');
const { uuidParamSchema } = require('../../validators/admin.validator');
const expeditionController = require('../../controllers/api/expedition.controller');

const router = express.Router();

router.get(
  '/',
  validate(expeditionValidator.listExpeditionsQuerySchema),
  expeditionController.listPublic
);

router.get(
  '/company',
  authenticate(),
  requireCompanyPortalUser,
  requireCompanyAccess(),
  expeditionController.listCompanyExpeditions
);

router.post(
  '/company',
  authenticate(),
  requireCompanyPortalUser,
  requireCompanyAccess({ allowedCompanyRoles: ['owner', 'admin', 'manager'] }),
  checkPlanLimit('expeditions'),
  uploadLimiter,
  uploadSingleImage('coverImage', 'expeditions'),
  validate(expeditionValidator.createExpeditionSchema),
  expeditionController.createCompanyExpedition
);

router.patch(
  '/company/:id',
  authenticate(),
  requireCompanyPortalUser,
  requireCompanyAccess({ allowedCompanyRoles: ['owner', 'admin', 'manager'] }),
  uploadLimiter,
  uploadSingleImage('coverImage', 'expeditions'),
  validate(expeditionValidator.updateExpeditionSchema),
  expeditionController.updateCompanyExpedition
);

router.get(
  '/company/:id/participants',
  authenticate(),
  requireCompanyPortalUser,
  requireCompanyAccess(),
  validate(uuidParamSchema),
  expeditionController.listParticipants
);

router.get('/:idOrSlug', optionalAuth, expeditionController.getPublicDetail);

module.exports = router;