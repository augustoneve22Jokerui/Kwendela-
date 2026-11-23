'use strict';

const express = require('express');
const { authenticate } = require('../../middlewares/auth.middleware');
const { requireCompanyPortalUser } = require('../../middlewares/rbac.middleware');
const { requireCompanyAccess } = require('../../middlewares/companyAccess.middleware');
const { checkPlanLimit } = require('../../middlewares/planLimit.middleware');
const { financialLimiter, uploadLimiter } = require('../../middlewares/rateLimit.middleware');
const { uploadSingleImage } = require('../../middlewares/upload.middleware');
const { validate } = require('../../middlewares/validate.middleware');
const companyValidator = require('../../validators/company.validator');
const companyController = require('../../controllers/api/company.controller');

const router = express.Router();

router.use(authenticate(), requireCompanyPortalUser, requireCompanyAccess());

router.get('/dashboard', companyController.getDashboard);

router.get('/profile', companyController.getProfile);
router.patch(
  '/profile',
  requireCompanyAccess({ allowedCompanyRoles: ['owner', 'admin'] }),
  validate(companyValidator.updateCompanyProfileSchema),
  companyController.updateProfile
);
router.post(
  '/profile/media',
  requireCompanyAccess({ allowedCompanyRoles: ['owner', 'admin'] }),
  uploadLimiter,
  uploadSingleImage('file', 'companies'),
  companyController.updateMedia
);

router.get('/team', companyController.listTeam);
router.post(
  '/team',
  requireCompanyAccess({ allowedCompanyRoles: ['owner', 'admin'] }),
  checkPlanLimit('users'),
  validate(companyValidator.addTeamMemberSchema),
  companyController.addTeamMember
);
router.patch(
  '/team/:memberId',
  requireCompanyAccess({ allowedCompanyRoles: ['owner', 'admin'] }),
  validate(companyValidator.updateTeamMemberSchema),
  companyController.updateTeamMember
);

router.get('/guides', companyController.listGuides);
router.post(
  '/guides',
  requireCompanyAccess({ allowedCompanyRoles: ['owner', 'admin', 'manager'] }),
  validate(companyValidator.createGuideSchema),
  companyController.createGuide
);
router.patch(
  '/guides/:guideId',
  requireCompanyAccess({ allowedCompanyRoles: ['owner', 'admin', 'manager'] }),
  validate(companyValidator.updateGuideSchema),
  companyController.updateGuide
);

router.get('/transports', companyController.listTransports);
router.post(
  '/transports',
  requireCompanyAccess({ allowedCompanyRoles: ['owner', 'admin', 'manager'] }),
  validate(companyValidator.createTransportSchema),
  companyController.createTransport
);
router.patch(
  '/transports/:transportId',
  requireCompanyAccess({ allowedCompanyRoles: ['owner', 'admin', 'manager'] }),
  validate(companyValidator.updateTransportSchema),
  companyController.updateTransport
);

router.get(
  '/finance',
  requireCompanyAccess({ allowedCompanyRoles: ['owner', 'admin', 'manager'] }),
  companyController.getFinanceSummary
);

router.get(
  '/reports',
  requireCompanyAccess({ allowedCompanyRoles: ['owner', 'admin', 'manager'] }),
  companyController.getReports
);

router.get(
  '/subscription',
  requireCompanyAccess({ allowedCompanyRoles: ['owner', 'admin'] }),
  companyController.getSubscription
);
router.post(
  '/subscription',
  requireCompanyAccess({ allowedCompanyRoles: ['owner', 'admin'] }),
  financialLimiter,
  validate(companyValidator.requestSubscriptionChangeSchema),
  companyController.changeSubscription
);

module.exports = router;