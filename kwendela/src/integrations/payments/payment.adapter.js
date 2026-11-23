'use strict';

const ApiError = require('../../utils/ApiError');

class BasePaymentAdapter {
  constructor({ providerCode, providerName, isDemo = false }) {
    if (!providerCode || !providerName) {
      throw new Error('Adaptador de pagamento requer providerCode e providerName.');
    }
    this.providerCode = providerCode;
    this.providerName = providerName;
    this.isDemo = Boolean(isDemo);
  }

  validateAmount(amount) {
    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw ApiError.badRequest(
        'O montante da operação financeira deve ser um número positivo.',
        null,
        'INVALID_PAYMENT_AMOUNT'
      );
    }
    return Number(parsed.toFixed(2));
  }

  async initiateDeposit(_payload) {
    throw new Error(`Método initiateDeposit() não implementado para ${this.providerCode}.`);
  }

  async verifyPaymentStatus(_providerReference) {
    throw new Error(`Método verifyPaymentStatus() não implementado para ${this.providerCode}.`);
  }

  async initiatePayout(_payload) {
    throw new Error(`Método initiatePayout() não implementado para ${this.providerCode}.`);
  }
}

module.exports = BasePaymentAdapter;