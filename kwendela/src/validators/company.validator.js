'use strict';

const Joi = require('joi');

const updateCompanyProfileSchema = {
  body: Joi.object({
    name: Joi.string().min(2).max(160).optional(),
    legalName: Joi.string().min(2).max(200).allow('', null),
    taxId: Joi.string().min(5).max(60).allow('', null),
    email: Joi.string().email().max(160).optional(),
    phone: Joi.string().min(6).max(40).optional(),
    website: Joi.string().uri().max(255).allow('', null),
    description: Joi.string().max(4000).allow('', null),
    province: Joi.string().min(2).max(100).optional(),
    city: Joi.string().min(2).max(100).optional(),
    address: Joi.string().max(255).allow('', null),
    socialLinks: Joi.object().unknown(true).optional()
  }).min(1)
};

const addTeamMemberSchema = {
  body: Joi.object({
    fullName: Joi.string().min(2).max(140).required(),
    email: Joi.string().email().max(160).lowercase().required(),
    phone: Joi.string().min(6).max(40).allow('', null),
    companyRole: Joi.string()
      .valid('admin', 'manager', 'guide', 'staff')
      .default('staff'),
    initialPassword: Joi.string()
      .min(8)
      .max(128)
      .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/)
      .optional()
      .messages({
        'string.pattern.base':
          'A palavra-passe inicial deve conter pelo menos uma letra maiúscula, uma minúscula e um número.'
      })
  })
};

const updateTeamMemberSchema = {
  params: Joi.object({
    memberId: Joi.string().uuid().required()
  }),
  body: Joi.object({
    companyRole: Joi.string().valid('admin', 'manager', 'guide', 'staff').optional(),
    isActive: Joi.boolean().optional()
  }).min(1)
};

const createGuideSchema = {
  body: Joi.object({
    userId: Joi.string().uuid().allow(null),
    fullName: Joi.string().min(2).max(140).required(),
    email: Joi.string().email().max(160).allow('', null),
    phone: Joi.string().min(6).max(40).required(),
    languages: Joi.array().items(Joi.string().min(2).max(40)).min(1).default(['Português']),
    specialties: Joi.array().items(Joi.string().min(2).max(80)).default([]),
    licenseNumber: Joi.string().max(80).allow('', null),
    bio: Joi.string().max(1500).allow('', null)
  })
};

const updateGuideSchema = {
  params: Joi.object({
    guideId: Joi.string().uuid().required()
  }),
  body: Joi.object({
    fullName: Joi.string().min(2).max(140).optional(),
    email: Joi.string().email().max(160).allow('', null),
    phone: Joi.string().min(6).max(40).optional(),
    languages: Joi.array().items(Joi.string().min(2).max(40)).min(1).optional(),
    specialties: Joi.array().items(Joi.string().min(2).max(80)).optional(),
    licenseNumber: Joi.string().max(80).allow('', null),
    bio: Joi.string().max(1500).allow('', null),
    isActive: Joi.boolean().optional()
  }).min(1)
};

const createTransportSchema = {
  body: Joi.object({
    name: Joi.string().min(2).max(140).required(),
    vehicleType: Joi.string()
      .valid('4x4', 'van', 'minibus', 'bus', 'boat', 'aircraft', 'other')
      .required(),
    plateNumber: Joi.string().max(40).allow('', null),
    capacity: Joi.number().integer().min(1).max(200).required(),
    hasAc: Joi.boolean().default(true),
    features: Joi.array().items(Joi.string().max(80)).default([]),
    notes: Joi.string().max(1000).allow('', null)
  })
};

const updateTransportSchema = {
  params: Joi.object({
    transportId: Joi.string().uuid().required()
  }),
  body: Joi.object({
    name: Joi.string().min(2).max(140).optional(),
    vehicleType: Joi.string()
      .valid('4x4', 'van', 'minibus', 'bus', 'boat', 'aircraft', 'other')
      .optional(),
    plateNumber: Joi.string().max(40).allow('', null),
    capacity: Joi.number().integer().min(1).max(200).optional(),
    hasAc: Joi.boolean().optional(),
    features: Joi.array().items(Joi.string().max(80)).optional(),
    notes: Joi.string().max(1000).allow('', null),
    isActive: Joi.boolean().optional()
  }).min(1)
};

const requestSubscriptionChangeSchema = {
  body: Joi.object({
    planId: Joi.string().uuid().required(),
    durationMonths: Joi.number().integer().min(1).max(12).default(1),
    paymentMethod: Joi.string().valid('wallet', 'internal_demo').default('wallet'),
    idempotencyKey: Joi.string().min(8).max(120).optional()
  })
};

module.exports = {
  updateCompanyProfileSchema,
  addTeamMemberSchema,
  updateTeamMemberSchema,
  createGuideSchema,
  updateGuideSchema,
  createTransportSchema,
  updateTransportSchema,
  requestSubscriptionChangeSchema
};