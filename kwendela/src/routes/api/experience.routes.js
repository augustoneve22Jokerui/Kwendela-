'use strict';

const express = require('express');
const { authenticate } = require('../../middlewares/auth.middleware');
const { requireCompanyPortalUser } = require('../../middlewares/rbac.middleware');
const { requireCompanyAccess } = require('../../middlewares/companyAccess.middleware');
const { checkPlanLimit } = require('../../middlewares/planLimit.middleware');
const { uploadLimiter } = require('../../middlewares/rateLimit.middleware');
const { uploadSingleImage, uploadSingleMedia } = require('../../middlewares/upload.middleware');
const { validate } = require('../../middlewares/validate.middleware');
const experienceValidator = require('../../validators/experience.validator');
const { uuidParamSchema } = require('../../validators/admin.validator');
const experienceController = require('../../controllers/api/experience.controller');

const router = express.Router();

router.get(
  '/',
  validate(experienceValidator.listExperiencesQuerySchema),
  experienceController.listPublic
);

router.get(
  '/company',
  authenticate(),
  requireCompanyPortalUser,
  requireCompanyAccess(),
  experienceController.listCompanyExperiences
);

router.post(
  '/company',
  authenticate(),
  requireCompanyPortalUser,
  requireCompanyAccess({ allowedCompanyRoles: ['owner', 'admin', 'manager'] }),
  checkPlanLimit('experiences'),
  uploadLimiter,
  uploadSingleImage('coverImage', 'experiences'),
  validate(experienceValidator.createExperienceSchema),
  experienceController.createCompanyExperience
);

router.patch(
  '/company/:id',
  authenticate(),
  requireCompanyPortalUser,
  requireCompanyAccess({ allowedCompanyRoles: ['owner', 'admin', 'manager'] }),
  uploadLimiter,
  uploadSingleImage('coverImage', 'experiences'),
  validate(experienceValidator.updateExperienceSchema),
  experienceController.updateCompanyExperience
);

router.delete(
  '/company/:id',
  authenticate(),
  requireCompanyPortalUser,
  requireCompanyAccess({ allowedCompanyRoles: ['owner', 'admin', 'manager'] }),
  validate(uuidParamSchema),
  experienceController.archiveCompanyExperience
);

router.post(
  '/company/:id/media',
  authenticate(),
  requireCompanyPortalUser,
  requireCompanyAccess({ allowedCompanyRoles: ['owner', 'admin', 'manager'] }),
  uploadLimiter,
  uploadSingleMedia('media', 'experiences'),
  validate(experienceValidator.addExperienceMediaSchema),
  experienceController.addMedia
);

router.delete(
  '/company/:id/media/:mediaId',
  authenticate(),
  requireCompanyPortalUser,
  requireCompanyAccess({ allowedCompanyRoles: ['owner', 'admin', 'manager'] }),
  experienceController.removeMedia
);

router.get('/:idOrSlug', experienceController.getPublicDetail);

module.exports = router;