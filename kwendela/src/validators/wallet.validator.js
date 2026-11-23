'use strict';

const Joi = require('joi');

const demoTopupSchema = {
  body: Joi.object({
    amount: Joi.number().positive().min(100).max(5000000).precision(2).required(),
    provider: Joi.string().valid('internal_demo', 'unitel_money', 'bank_transfer').default('internal_demo'),
    description: Joi.string().max(255).allow('', null),
    idempotencyKey: Joi.string().min(8).max(120).optional()
  })
};

const transferSchema = {
  body: Joi.object({
    recipientIdentifier: Joi.string().min(4).max(160).required().messages({
      'any.required': 'Informe o email ou identificador da conta destinatária.'
    }),
    amount: Joi.number().positive().min(10).max(10000000).precision(2).required(),
    description: Joi.string().max(255).allow('', null),
    idempotencyKey: Joi.string().min(8).max(120).optional()
  })
};

const createQrPaymentSchema = {
  body: Joi.object({
    amount: Joi.number().positive().min(10).max(5000000).precision(2).allow(null),
    description: Joi.string().max(140).allow('', null),
    expiresInMinutes: Joi.number().integer().min(5).max(1440).default(30)
  })
};

const payQrSchema = {
  body: Joi.object({
    qrToken: Joi.string().min(10).max(2048).required(),
    amount: Joi.number().positive().min(10).max(5000000).precision(2).optional(),
    idempotencyKey: Joi.string().min(8).max(120).optional()
  })
};

const purchasePremiumSchema = {
  body: Joi.object({
    tier: Joi.string().valid('monthly', 'yearly').default('monthly'),
    paymentMethod: Joi.string().valid('wallet', 'internal_demo').default('wallet'),
    idempotencyKey: Joi.string().min(8).max(120).optional()
  })
};

const walletTransactionsQuerySchema = {
  query: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    type: Joi.string()
      .valid(
        'demo_topup',
        'transfer',
        'booking_payment',
        'booking_hold',
        'booking_release',
        'refund',
        'commission',
        'subscription_payment',
        'premium_payment',
        'qr_payment'
      )
      .optional(),
    status: Joi.string().valid('pending', 'completed', 'failed', 'reversed').optional(),
    startDate: Joi.date().iso().optional(),
    endDate: Joi.date().iso().optional()
  })
};

module.exports = {
  demoTopupSchema,
  transferSchema,
  createQrPaymentSchema,
  payQrSchema,
  purchasePremiumSchema,
  walletTransactionsQuerySchema
};