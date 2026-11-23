'use strict';

const express = require('express');
const Joi = require('joi');
const { authenticate } = require('../../middlewares/auth.middleware');
const { validate } = require('../../middlewares/validate.middleware');
const reportController = require('../../controllers/api/report.controller');

const createReportSchema = {
  body: Joi.object({
    targetType: Joi.string()
      .valid('conversation', 'company', 'experience', 'destination', 'review', 'user')
      .required(),
    targetId: Joi.string().uuid().required(),
    reason: Joi.string()
      .valid('harassment', 'fraud', 'spam', 'inappropriate', 'safety', 'other')
      .required(),
    description: Joi.string().min(5).max(1500).required()
  })
};

const router = express.Router();

router.use(authenticate());

router.post('/', validate(createReportSchema), reportController.createReport);
router.get('/me', reportController.listMyReports);

module.exports = router;