'use strict';

const Joi = require('joi');

const uuidParamSchema = {
  params: Joi.object({
    id: Joi.string().uuid().required()
  })
};

const createCompanyAccountSchema = {
  body: Joi.object({
    companyName: Joi.string().min(2).max(160).required(),
    legalName: Joi.string().min(2).max(200).allow('', null),
    taxId: Joi.string().min(5).max(60).allow('', null),
    companyEmail: Joi.string().email().max(160).required(),
    companyPhone: Joi.string().min(6).max(40).required(),
    province: Joi.string().min(2).max(100).required(),
    city: Joi.string().min(2).max(100).required(),
    address: Joi.string().max(255).allow('', null),
    description: Joi.string().max(3000).allow('', null),
    ownerName: Joi.string().min(2).max(140).required(),
    ownerEmail: Joi.string().email().max(160).required(),
    ownerPhone: Joi.string().min(6).max(40).allow('', null),
    initialPassword: Joi.string()
      .min(8)
      .max(128)
      .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/)
      .required()
      .messages({
        'string.pattern.base':
          'A palavra-passe inicial deve conter pelo menos uma letra maiúscula, uma minúscula e um número.'
      }),
    planId: Joi.string().uuid().required(),
    durationMonths: Joi.number().integer().min(1).max(36).default(1),
    isVerified: Joi.boolean().default(true)
  })
};

const updateCompanyStatusSchema = {
  params: Joi.object({
    id: Joi.string().uuid().required()
  }),
  body: Joi.object({
    status: Joi.string()
      .valid('pending_verification', 'active', 'suspended', 'rejected')
      .required(),
    isVerified: Joi.boolean().optional(),
    reason: Joi.string().max(500).allow('', null)
  })
};

const assignCompanyPlanSchema = {
  params: Joi.object({
    id: Joi.string().uuid().required()
  }),
  body: Joi.object({
    planId: Joi.string().uuid().required(),
    durationMonths: Joi.number().integer().min(1).max(36).default(1),
    autoRenew: Joi.boolean().default(false),
    notes: Joi.string().max(500).allow('', null)
  })
};

const updatePlanSchema = {
  params: Joi.object({
    id: Joi.string().uuid().required()
  }),
  body: Joi.object({
    name: Joi.string().min(2).max(120).optional(),
    description: Joi.string().max(1000).allow('', null),
    priceKz: Joi.number().min(0).precision(2).optional(),
    billingCycle: Joi.string().valid('monthly', 'quarterly', 'yearly').optional(),
    maxUsers: Joi.number().integer().min(-1).allow(null),
    maxExperiences: Joi.number().integer().min(-1).allow(null),
    maxDestinations: Joi.number().integer().min(-1).allow(null),
    features: Joi.object().unknown(true).optional(),
    limits: Joi.object().unknown(true).optional(),
    isActive: Joi.boolean().optional()
  }).min(1)
};

const updateUserStatusSchema = {
  params: Joi.object({
    id: Joi.string().uuid().required()
  }),
  body: Joi.object({
    status: Joi.string().valid('active', 'suspended', 'pending_verification').required(),
    reason: Joi.string().max(500).allow('', null)
  })
};

const moderateContentSchema = {
  params: Joi.object({
    id: Joi.string().uuid().required()
  }),
  body: Joi.object({
    moderationStatus: Joi.string()
      .valid('approved', 'rejected', 'archived', 'pending_review')
      .required(),
    moderationNotes: Joi.string().max(1000).allow('', null)
  })
};

const resolveReportSchema = {
  params: Joi.object({
    id: Joi.string().uuid().required()
  }),
  body: Joi.object({
    status: Joi.string().valid('under_review', 'resolved', 'dismissed').required(),
    resolutionNotes: Joi.string().min(3).max(1500).required()
  })
};

const updateGlobalSettingsSchema = {
  body: Joi.object({
    settings: Joi.array()
      .items(
        Joi.object({
          key: Joi.string().min(2).max(100).required(),
          value: Joi.alternatives().try(
            Joi.string().allow(''),
            Joi.number(),
            Joi.boolean(),
            Joi.object()
          ).required(),
          description: Joi.string().max(400).allow('', null)
        })
      )
      .min(1)
      .required()
  })
};

module.exports = {
  uuidParamSchema,
  createCompanyAccountSchema,
  updateCompanyStatusSchema,
  assignCompanyPlanSchema,
  updatePlanSchema,
  updateUserStatusSchema,
  moderateContentSchema,
  resolveReportSchema,
  updateGlobalSettingsSchema
};