'use strict';

const Joi = require('joi');

const strongPassword = Joi.string()
  .min(8)
  .max(128)
  .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/)
  .messages({
    'string.min': 'A palavra-passe deve ter pelo menos 8 caracteres.',
    'string.pattern.base':
      'A palavra-passe deve incluir pelo menos uma letra maiúscula, uma minúscula e um número.'
  });

const registerSchema = {
  body: Joi.object({
    fullName: Joi.string().min(2).max(140).required(),
    email: Joi.string().email().max(160).lowercase().required(),
    phone: Joi.string().min(6).max(40).allow('', null),
    password: strongPassword.required(),
    confirmPassword: Joi.string()
      .valid(Joi.ref('password'))
      .optional()
      .messages({
        'any.only': 'A confirmação da palavra-passe não coincide.'
      }),
    nationality: Joi.string().max(80).allow('', null),
    preferredLanguage: Joi.string().valid('pt', 'en', 'fr').default('pt')
  })
};

const loginSchema = {
  body: Joi.object({
    email: Joi.string().email().max(160).lowercase().required(),
    password: Joi.string().min(1).max(128).required()
  })
};

const refreshTokenSchema = {
  body: Joi.object({
    refreshToken: Joi.string().min(10).max(2048).optional()
  })
};

const forgotPasswordSchema = {
  body: Joi.object({
    email: Joi.string().email().max(160).lowercase().required()
  })
};

const resetPasswordSchema = {
  body: Joi.object({
    token: Joi.string().min(20).max(512).required(),
    newPassword: strongPassword.required(),
    confirmPassword: Joi.string()
      .valid(Joi.ref('newPassword'))
      .required()
      .messages({
        'any.only': 'A confirmação da nova palavra-passe não coincide.'
      })
  })
};

const changePasswordSchema = {
  body: Joi.object({
    currentPassword: Joi.string().min(1).max(128).required(),
    newPassword: strongPassword.disallow(Joi.ref('currentPassword')).required().messages({
      'any.invalid': 'A nova palavra-passe deve ser diferente da atual.'
    }),
    confirmPassword: Joi.string()
      .valid(Joi.ref('newPassword'))
      .required()
      .messages({
        'any.only': 'A confirmação da nova palavra-passe não coincide.'
      })
  })
};

const updateProfileSchema = {
  body: Joi.object({
    fullName: Joi.string().min(2).max(140).optional(),
    phone: Joi.string().min(6).max(40).allow('', null),
    bio: Joi.string().max(1000).allow('', null),
    province: Joi.string().max(100).allow('', null),
    city: Joi.string().max(100).allow('', null),
    nationality: Joi.string().max(80).allow('', null),
    preferredLanguage: Joi.string().valid('pt', 'en', 'fr').optional()
  }).min(1)
};

module.exports = {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  updateProfileSchema
};