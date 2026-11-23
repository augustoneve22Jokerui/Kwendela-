'use strict';

const BasePaymentAdapter = require('./payment.adapter');
const { generateRandomToken } = require('../../utils/crypto');

class BankTransferAdapter extends BasePaymentAdapter {
  constructor() {
    super({
      providerCode: 'bank_transfer',
      providerName: 'Transferência Bancária (AOA)',
      isDemo: false
    });
  }

  async initiateDeposit({ userId, amount, currency = 'AOA', description = '' }) {
    this.validateAmount(amount);

    const providerReference = `BT-PREP-${generateRandomToken(4).toUpperCase()}`;

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
        'A liquidação automática por transferência bancária ainda não está ativa neste ambiente. A ativação de operações reais depende de autorização regulatória e ligação bancária homologada.'
    };
  }

  async verifyPaymentStatus(providerReference) {
    return {
      settled: false,
      status: 'pending_external_integration',
      provider: this.providerCode,
      providerReference,
      message: 'Verificação bancária externa indisponível neste ambiente.'
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
      message: 'Transferências bancárias externas de saída não estão ativas.'
    };
  }
}

module.exports = new BankTransferAdapter();