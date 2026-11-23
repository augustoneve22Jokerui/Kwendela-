'use strict';

const express = require('express');
const { authenticate } = require('../../middlewares/auth.middleware');
const { financialLimiter } = require('../../middlewares/rateLimit.middleware');
const { validate } = require('../../middlewares/validate.middleware');
const walletValidator = require('../../validators/wallet.validator');
const walletController = require('../../controllers/api/wallet.controller');

const router = express.Router();

router.use(authenticate());

router.get('/', walletController.getMyWallet);

router.get(
  '/transactions',
  validate(walletValidator.walletTransactionsQuerySchema),
  walletController.listMyTransactions
);

router.post(
  '/topup/demo',
  financialLimiter,
  validate(walletValidator.demoTopupSchema),
  walletController.demoTopup
);

router.post(
  '/transfer',
  financialLimiter,
  validate(walletValidator.transferSchema),
  walletController.transferFunds
);

router.post(
  '/qr',
  financialLimiter,
  validate(walletValidator.createQrPaymentSchema),
  walletController.createQrPaymentRequest
);

router.post(
  '/qr/pay',
  financialLimiter,
  validate(walletValidator.payQrSchema),
  walletController.payQrCode
);

router.post(
  '/premium',
  financialLimiter,
  validate(walletValidator.purchasePremiumSchema),
  walletController.purchasePremium
);

module.exports = router;