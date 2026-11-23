'use strict';

const express = require('express');
const { authenticate } = require('../../middlewares/auth.middleware');
const { requireCompanyPortalUser } = require('../../middlewares/rbac.middleware');
const { requireCompanyAccess } = require('../../middlewares/companyAccess.middleware');
const companyWebController = require('../../controllers/web/company.controller');

const router = express.Router();

router.use(authenticate(), requireCompanyPortalUser, requireCompanyAccess());

router.get('/', companyWebController.renderDashboard);
router.get('/profile', companyWebController.renderProfile);
router.get('/destinations', companyWebController.renderDestinations);
router.get('/experiences', companyWebController.renderExperiences);
router.get('/expeditions', companyWebController.renderExpeditions);
router.get('/bookings', companyWebController.renderBookings);
router.get('/guides-transports', companyWebController.renderGuidesTransports);
router.get('/routes', companyWebController.renderRoutes);
router.get('/chat', companyWebController.renderChat);
router.get('/notifications', companyWebController.renderNotifications);

router.get(
  '/finance',
  requireCompanyAccess({ allowedCompanyRoles: ['owner', 'admin', 'manager'] }),
  companyWebController.renderFinance
);

router.get(
  '/reports',
  requireCompanyAccess({ allowedCompanyRoles: ['owner', 'admin', 'manager'] }),
  companyWebController.renderReports
);

router.get(
  '/team',
  requireCompanyAccess({ allowedCompanyRoles: ['owner', 'admin', 'manager'] }),
  companyWebController.renderTeam
);

router.get(
  '/subscription',
  requireCompanyAccess({ allowedCompanyRoles: ['owner', 'admin'] }),
  companyWebController.renderSubscription
);

module.exports = router;