'use strict';

const express = require('express');
const { authenticate } = require('../../middlewares/auth.middleware');
const { requireSuperadmin } = require('../../middlewares/rbac.middleware');
const { validate } = require('../../middlewares/validate.middleware');
const adminValidator = require('../../validators/admin.validator');
const adminController = require('../../controllers/api/admin.controller');

const router = express.Router();

router.use(authenticate(), requireSuperadmin);

router.get('/overview', adminController.getOverview);

router.get('/companies', adminController.listCompanies);
router.post(
  '/companies',
  validate(adminValidator.createCompanyAccountSchema),
  adminController.createCompanyAccount
);
router.get(
  '/companies/:id',
  validate(adminValidator.uuidParamSchema),
  adminController.getCompanyDetails
);
router.patch(
  '/companies/:id/status',
  validate(adminValidator.updateCompanyStatusSchema),
  adminController.updateCompanyStatus
);
router.post(
  '/companies/:id/plan',
  validate(adminValidator.assignCompanyPlanSchema),
  adminController.assignCompanyPlan
);

router.get('/plans', adminController.listPlans);
router.patch(
  '/plans/:id',
  validate(adminValidator.updatePlanSchema),
  adminController.updatePlan
);

router.get('/subscriptions', adminController.listSubscriptions);
router.get('/payments', adminController.listPayments);

router.get('/users', adminController.listUsers);
router.patch(
  '/users/:id/status',
  validate(adminValidator.updateUserStatusSchema),
  adminController.updateUserStatus
);

router.get('/destinations', adminController.listDestinationsForModeration);
router.patch(
  '/destinations/:id/moderate',
  validate(adminValidator.moderateContentSchema),
  adminController.moderateDestination
);

router.get('/experiences', adminController.listExperiencesForModeration);
router.patch(
  '/experiences/:id/moderate',
  validate(adminValidator.moderateContentSchema),
  adminController.moderateExperience
);

router.get('/bookings', adminController.listBookings);

router.get('/reports', adminController.listReports);
router.patch(
  '/reports/:id',
  validate(adminValidator.resolveReportSchema),
  adminController.resolveReport
);

router.get('/audit-logs', adminController.listAuditLogs);

router.get('/settings', adminController.getGlobalSettings);
router.put(
  '/settings',
  validate(adminValidator.updateGlobalSettingsSchema),
  adminController.updateGlobalSettings
);

module.exports = router;