'use strict';

const BasePaymentAdapter = require('./payment.adapter');
const env = require('../../config/env');
const ApiError = require('../../utils/ApiError');
const { generateRandomToken } = require('../../utils/crypto');

class InternalDemoAdapter extends BasePaymentAdapter {
  constructor() {
    super({
      providerCode: 'internal_demo',
      providerName: 'KWENDELA Demonstração Interna',
      isDemo: true
    });
  }

  async initiateDeposit({ userId, amount, currency = 'AOA', description = '' }) {
    if (!env.wallet.demoMode) {
      throw ApiError.forbidden(
        'O adaptador interno de demonstração está desativado neste ambiente.',
        'DEMO_MODE_DISABLED'
      );
    }

    this.validateAmount(amount);

    const providerReference = `DEMO-${generateRandomToken(5).toUpperCase()}`;

    return {
      settledImmediately: true,
      status: 'completed',
      provider: this.providerCode,
      providerReference,
      userId,
      amount: Number(amount),
      currency,
      description: description || '[DEMO] Crédito interno de demonstração',
      isDemo: true,
      message: 'Operação interna de demonstração concluída (sem movimento de dinheiro real).'
    };
  }

  async verifyPaymentStatus(providerReference) {
    return {
      settled: Boolean(env.wallet.demoMode),
      status: env.wallet.demoMode ? 'completed' : 'disabled',
      provider: this.providerCode,
      providerReference,
      isDemo: true
    };
  }

  async initiatePayout({ destinationAccount, amount, currency = 'AOA' }) {
    this.validateAmount(amount);
    return {
      accepted: Boolean(env.wallet.demoMode),
      status: env.wallet.demoMode ? 'completed' : 'disabled',
      provider: this.providerCode,
      providerReference: `DEMO-OUT-${generateRandomToken(4).toUpperCase()}`,
      destinationAccount,
      amount: Number(amount),
      currency,
      isDemo: true
    };
  }
}

module.exports = new InternalDemoAdapter();