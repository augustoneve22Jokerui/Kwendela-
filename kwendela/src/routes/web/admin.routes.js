'use strict';

const express = require('express');
const { authenticate } = require('../../middlewares/auth.middleware');
const { requireSuperadmin } = require('../../middlewares/rbac.middleware');
const adminWebController = require('../../controllers/web/admin.controller');

const router = express.Router();

router.use(authenticate(), requireSuperadmin);

router.get('/', adminWebController.renderDashboard);
router.get('/companies', adminWebController.renderCompanies);
router.get('/plans', adminWebController.renderPlans);
router.get('/subscriptions', adminWebController.renderSubscriptions);
router.get('/payments', adminWebController.renderPayments);
router.get('/users', adminWebController.renderUsers);
router.get('/destinations', adminWebController.renderDestinationsModeration);
router.get('/experiences', adminWebController.renderExperiencesModeration);
router.get('/bookings', adminWebController.renderBookings);
router.get('/reports', adminWebController.renderReports);
router.get('/audit', adminWebController.renderAudit);
router.get('/settings', adminWebController.renderSettings);

module.exports = router;