'use strict';

const BasePaymentAdapter = require('./payment.adapter');
const { generateRandomToken } = require('../../utils/crypto');

class UnitelMoneyAdapter extends BasePaymentAdapter {
  constructor() {
    super({
      providerCode: 'unitel_money',
      providerName: 'Unitel Money (AOA)',
      isDemo: false
    });
  }

  async initiateDeposit({ userId, amount, currency = 'AOA', description = '' }) {
    this.validateAmount(amount);

    const providerReference = `UM-PREP-${generateRandomToken(4).toUpperCase()}`;

    return {
      settledImmediately: false,
      status: 'pending_external_integration',
      provider: this.providerCode,
      providerReference,
      userId,
      amount: Number(amount),
      currency,
      description,
      isDemo: false,
      message:
        'A integração com Unitel Money encontra-se preparada, mas não está ativa para movimentos reais neste ambiente. Utilize o carregamento interno de demonstração para testes.'
    };
  }

  async verifyPaymentStatus(providerReference) {
    return {
      settled: false,
      status: 'pending_external_integration',
      provider: this.providerCode,
      providerReference,
      message: 'Consulta de estado Unitel Money indisponível sem credenciais comerciais homologadas.'
    };
  }

  async initiatePayout({ destinationAccount, amount, currency = 'AOA' }) {
    this.validateAmount(amount);
    return {
      accepted: false,
      status: 'not_active',
      provider: this.providerCode,
      destinationAccount,
      amount: Number(amount),
      currency,
      message: 'Levantamentos para Unitel Money ainda não estão ativos neste ambiente.'
    };
  }
}

module.exports = new UnitelMoneyAdapter();