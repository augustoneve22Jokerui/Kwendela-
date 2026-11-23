'use strict';

const express = require('express');
const { authenticate } = require('../../middlewares/auth.middleware');
const { requireCompanyPortalUser } = require('../../middlewares/rbac.middleware');
const { requireCompanyAccess } = require('../../middlewares/companyAccess.middleware');
const planController = require('../../controllers/api/plan.controller');

const router = express.Router();

router.get('/', planController.listPlans);

router.get(
  '/company/usage',
  authenticate(),
  requireCompanyPortalUser,
  requireCompanyAccess(),
  planController.getCompanyPlanUsage
);

router.get('/:idOrCode', planController.getPlanDetail);

module.exports = router;