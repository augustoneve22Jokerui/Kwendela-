'use strict';

const { withTransaction } = require('../config/database');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const { generateRandomToken, generateAccountCode } = require('../utils/crypto');
const {
  createSignedQrPayload,
  verifyQrPayloadSignature,
  generateQrDataUrl
} = require('../utils/qr');
const { buildPaginationMeta } = require('../utils/pagination');
const { recordAuditLog } = require('../middlewares/audit.middleware');
const walletRepository = require('../repositories/wallet.repository');
const userRepository = require('../repositories/user.repository');
const notificationService = require('./notification.service');
const internalDemoAdapter = require('../integrations/payments/internalDemo.adapter');
const unitelMoneyAdapter = require('../integrations/payments/unitelMoney.adapter');
const bankTransferAdapter = require('../integrations/payments/bankTransfer.adapter');

const PREMIUM_PRICING_KZ = Object.freeze({
  monthly: 5000,
  yearly: 50000
});

function getPaymentAdapter(provider) {
  switch (provider) {
    case 'internal_demo':
      return internalDemoAdapter;
    case 'unitel_money':
      return unitelMoneyAdapter;
    case 'bank_transfer':
      return bankTransferAdapter;
    default:
      return null;
  }
}

async function lockWalletsInOrder(client, walletIds = []) {
  const uniqueSorted = [...new Set(walletIds.filter(Boolean).map(String))].sort();
  const lockedMap = new Map();

  for (const id of uniqueSorted) {
    const wallet = await walletRepository.findByIdForUpdate(id, client);
    if (!wallet) {
      throw ApiError.notFound('Carteira financeira não encontrada.');
    }
    lockedMap.set(String(wallet.id), wallet);
  }

  return lockedMap;
}

async function ensurePlatformWallet(client = null) {
  let platformWallet = await walletRepository.findPlatformWallet(client);
  if (!platformWallet) {
    platformWallet = await walletRepository.createWallet(
      {
        ownerType: 'platform',
        accountCode: generateAccountCode('KWP'),
        currency: 'AOA'
      },
      client
    );
  }
  return platformWallet;
}

async function ensureUserWallet(userId, client = null) {
  let wallet = await walletRepository.findByUserId(userId, client);
  if (!wallet) {
    wallet = await walletRepository.createWallet(
      {
        ownerType: 'user',
        ownerUserId: userId,
        accountCode: generateAccountCode('KWD'),
        currency: 'AOA'
      },
      client
    );
  }
  return wallet;
}

async function ensureCompanyWallet(companyId, client = null) {
  let wallet = await walletRepository.findByCompanyId(companyId, client);
  if (!wallet) {
    wallet = await walletRepository.createWallet(
      {
        ownerType: 'company',
        ownerCompanyId: companyId,
        accountCode: generateAccountCode('KWC'),
        currency: 'AOA'
      },
      client
    );
  }
  return wallet;
}

async function getMyWalletSummary(user) {
  const wallet = user.companyId && ['company_owner', 'company_admin'].includes(user.role)
    ? await ensureUserWallet(user.id)
    : await ensureUserWallet(user.id);

  const reconciliation = await walletRepository.reconcileWalletBalance(wallet.id);

  return {
    wallet,
    reconciliation,
    demoModeEnabled: env.wallet.demoMode
  };
}

async function listMyTransactions(userId, filters, pagination) {
  const wallet = await ensureUserWallet(userId);
  const { items, total } = await walletRepository.findTransactionsByWalletId(
    wallet.id,
    filters,
    pagination
  );

  return {
    wallet,
    items,
    pagination: buildPaginationMeta({
      page: pagination.page,
      limit: pagination.limit,
      total
    })
  };
}

async function demoTopup(user, payload, requestMeta = {}) {
  const provider = payload.provider || 'internal_demo';

  if (provider === 'internal_demo' && !env.wallet.demoMode) {
    throw ApiError.forbidden('O carregamento interno de demonstração está desativado.');
  }

  const adapter = getPaymentAdapter(provider);
  if (!adapter) {
    throw ApiError.badRequest('Provedor de pagamento não suportado.');
  }

  if (payload.idempotencyKey) {
    const existing = await walletRepository.findTransactionByIdempotencyKey(
      `topup:${user.id}:${payload.idempotencyKey}`
    );
    if (existing) {
      return existing;
    }
  }

  const amount = Number(Number(payload.amount).toFixed(2));
  const adapterResult = await adapter.initiateDeposit({
    userId: user.id,
    amount,
    currency: 'AOA',
    description: payload.description || 'Carregamento de demonstração KWENDELA'
  });

  if (!adapterResult.settledImmediately) {
    throw ApiError.unprocessable(
      adapterResult.message ||
        'Integração externa ainda não autorizada para liquidação automática de dinheiro real.',
      { provider, status: adapterResult.status },
      'EXTERNAL_PAYMENT_NOT_ACTIVE'
    );
  }

  const txResult = await withTransaction(async (client) => {
    const userWallet = await ensureUserWallet(user.id, client);
    const locked = await lockWalletsInOrder(client, [userWallet.id]);
    const targetWallet = locked.get(String(userWallet.id));

    const newBalance = Number((Number(targetWallet.available_balance) + amount).toFixed(2));

    const tx = await walletRepository.createTransaction(
      {
        referenceCode: `TOP-${generateRandomToken(4).toUpperCase()}`,
        transactionType: 'demo_topup',
        status: 'completed',
        destinationWalletId: targetWallet.id,
        amount,
        feeAmount: 0,
        currency: 'AOA',
        provider,
        isDemo: true,
        idempotencyKey: payload.idempotencyKey
          ? `topup:${user.id}:${payload.idempotencyKey}`
          : null,
        description:
          payload.description || '[DEMO] Carregamento interno de demonstração',
        initiatedByUserId: user.id,
        metadata: {
          isDemo: true,
          providerReference: adapterResult.providerReference
        }
      },
      client
    );

    await walletRepository.updateWalletBalances(
      targetWallet.id,
      { availableBalance: newBalance },
      client
    );

    await walletRepository.createLedgerEntry(
      {
        transactionId: tx.id,
        walletId: targetWallet.id,
        entryType: 'credit',
        amount,
        balanceAfter: newBalance,
        description: '[DEMO] Crédito interno de demonstração'
      },
      client
    );

    return { transaction: tx, availableBalance: newBalance };
  });

  await recordAuditLog({
    actorUserId: user.id,
    action: 'wallet.demo_topup',
    entityType: 'wallet_transaction',
    entityId: txResult.transaction.id,
    ipAddress: requestMeta.ip,
    userAgent: requestMeta.userAgent,
    metadata: { amount, provider, isDemo: true }
  });

  return txResult;
}

async function transferFunds(senderUser, payload, requestMeta = {}) {
  const amount = Number(Number(payload.amount).toFixed(2));
  if (amount <= 0) {
    throw ApiError.badRequest('O montante da transferência deve ser superior a zero.');
  }

  const scopedIdempotencyKey = payload.idempotencyKey
    ? `transfer:${senderUser.id}:${payload.idempotencyKey}`
    : null;

  if (scopedIdempotencyKey) {
    const existing = await walletRepository.findTransactionByIdempotencyKey(scopedIdempotencyKey);
    if (existing) {
      return { transaction: existing, deduplicated: true };
    }
  }

  const recipientWalletLookup = await walletRepository.findWalletByIdentifier(
    payload.recipientIdentifier
  );
  if (!recipientWalletLookup) {
    throw ApiError.notFound('Conta destinatária não encontrada para o email ou código informado.');
  }

  const txResult = await withTransaction(async (client) => {
    const senderWalletLookup = await ensureUserWallet(senderUser.id, client);

    if (String(senderWalletLookup.id) === String(recipientWalletLookup.id)) {
      throw ApiError.badRequest('Não pode transferir fundos para a sua própria carteira.');
    }

    const locked = await lockWalletsInOrder(client, [
      senderWalletLookup.id,
      recipientWalletLookup.id
    ]);
    const senderWallet = locked.get(String(senderWalletLookup.id));
    const recipientWallet = locked.get(String(recipientWalletLookup.id));

    if (Number(senderWallet.available_balance) < amount) {
      throw ApiError.conflict('Saldo disponível insuficiente para efetuar esta transferência.', 'INSUFFICIENT_BALANCE');
    }

    const senderNewBalance = Number((Number(senderWallet.available_balance) - amount).toFixed(2));
    const recipientNewBalance = Number((Number(recipientWallet.available_balance) + amount).toFixed(2));

    const tx = await walletRepository.createTransaction(
      {
        referenceCode: `TRF-${generateRandomToken(4).toUpperCase()}`,
        transactionType: 'transfer',
        status: 'completed',
        sourceWalletId: senderWallet.id,
        destinationWalletId: recipientWallet.id,
        amount,
        feeAmount: 0,
        currency: 'AOA',
        provider: 'internal_wallet',
        isDemo: Boolean(env.wallet.demoMode),
        idempotencyKey: scopedIdempotencyKey,
        description: payload.description || `Transferência interna para ${recipientWallet.account_code}`,
        initiatedByUserId: senderUser.id
      },
      client
    );

    await walletRepository.updateWalletBalances(
      senderWallet.id,
      { availableBalance: senderNewBalance },
      client
    );
    await walletRepository.updateWalletBalances(
      recipientWallet.id,
      { availableBalance: recipientNewBalance },
      client
    );

    await walletRepository.createLedgerEntry(
      {
        transactionId: tx.id,
        walletId: senderWallet.id,
        entryType: 'debit',
        amount,
        balanceAfter: senderNewBalance,
        description: `Transferência enviada (${recipientWallet.account_code})`
      },
      client
    );

    await walletRepository.createLedgerEntry(
      {
        transactionId: tx.id,
        walletId: recipientWallet.id,
        entryType: 'credit',
        amount,
        balanceAfter: recipientNewBalance,
        description: `Transferência recebida (${senderWallet.account_code})`
      },
      client
    );

    return {
      transaction: tx,
      senderBalance: senderNewBalance,
      recipientUserId: recipientWallet.owner_user_id || null
    };
  });

  await recordAuditLog({
    actorUserId: senderUser.id,
    action: 'wallet.transfer',
    entityType: 'wallet_transaction',
    entityId: txResult.transaction.id,
    ipAddress: requestMeta.ip,
    userAgent: requestMeta.userAgent,
    metadata: {
      amount,
      recipientIdentifier: payload.recipientIdentifier
    }
  });

  if (txResult.recipientUserId) {
    await notificationService.createNotification({
      userId: txResult.recipientUserId,
      type: 'wallet_transfer_received',
      title: 'Transferência recebida',
      message: `Recebeu ${amount.toLocaleString('pt-PT')} Kz na sua Carteira KWENDELA.`,
      referenceType: 'wallet_transaction',
      referenceId: txResult.transaction.id
    });
  }

  return txResult;
}

async function createQrPaymentRequest(user, payload) {
  const wallet =
    user.companyId && ['company_owner', 'company_admin'].includes(user.role)
      ? await ensureCompanyWallet(user.companyId)
      : await ensureUserWallet(user.id);

  const token = generateRandomToken(20);
  const expiresInMinutes = Number(payload.expiresInMinutes || 30);
  const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);
  const fixedAmount =
    payload.amount !== undefined && payload.amount !== null
      ? Number(Number(payload.amount).toFixed(2))
      : null;

  const signedPayload = createSignedQrPayload({
    token,
    accountCode: wallet.account_code,
    amount: fixedAmount,
    currency: 'AOA',
    description: payload.description || '',
    expiresAt
  });

  const qrRecord = await walletRepository.createQrCode({
    walletId: wallet.id,
    createdByUserId: user.id,
    token,
    amount: fixedAmount,
    description: payload.description || null,
    signedPayload,
    expiresAt
  });

  const qrDataUrl = await generateQrDataUrl(signedPayload);

  return {
    qr: qrRecord,
    signedPayload,
    qrDataUrl
  };
}

async function payQrCode(payerUser, payload, requestMeta = {}) {
  const qrRecord = await walletRepository.findQrByToken(payload.qrToken);
  if (!qrRecord) {
    throw ApiError.notFound('Código QR de pagamento inválido ou inexistente.');
  }

  if (qrRecord.status !== 'active') {
    throw ApiError.conflict('Este código QR já foi utilizado ou cancelado.');
  }

  if (new Date(qrRecord.expires_at) <= new Date()) {
    throw ApiError.conflict('Este código QR expirou.');
  }

  if (!verifyQrPayloadSignature(qrRecord.signed_payload)) {
    throw ApiError.badRequest('Assinatura criptográfica do QR Code inválida.');
  }

  const amount =
    qrRecord.amount !== null && qrRecord.amount !== undefined
      ? Number(qrRecord.amount)
      : Number(payload.amount);

  if (!Number.isFinite(amount) || amount <= 0) {
    throw ApiError.badRequest('Indique um montante válido para pagar este código QR.');
  }

  const scopedIdempotencyKey = payload.idempotencyKey
    ? `qrpay:${payerUser.id}:${payload.idempotencyKey}`
    : null;

  if (scopedIdempotencyKey) {
    const existing = await walletRepository.findTransactionByIdempotencyKey(scopedIdempotencyKey);
    if (existing) {
      return { transaction: existing, deduplicated: true };
    }
  }

  const txResult = await withTransaction(async (client) => {
    const lockedQr = await walletRepository.findQrByIdForUpdate(qrRecord.id, client);
    if (!lockedQr || lockedQr.status !== 'active') {
      throw ApiError.conflict('Este código QR já não se encontra disponível.');
    }

    const payerWalletLookup = await ensureUserWallet(payerUser.id, client);
    if (String(payerWalletLookup.id) === String(lockedQr.wallet_id)) {
      throw ApiError.badRequest('Não é possível efetuar um pagamento QR para a mesma carteira.');
    }

    const locked = await lockWalletsInOrder(client, [payerWalletLookup.id, lockedQr.wallet_id]);
    const payerWallet = locked.get(String(payerWalletLookup.id));
    const merchantWallet = locked.get(String(lockedQr.wallet_id));

    if (Number(payerWallet.available_balance) < amount) {
      throw ApiError.conflict('Saldo disponível insuficiente para pagamento por QR Code.', 'INSUFFICIENT_BALANCE');
    }

    const payerNewBalance = Number((Number(payerWallet.available_balance) - amount).toFixed(2));
    const merchantNewBalance = Number((Number(merchantWallet.available_balance) + amount).toFixed(2));

    const tx = await walletRepository.createTransaction(
      {
        referenceCode: `QRP-${generateRandomToken(4).toUpperCase()}`,
        transactionType: 'qr_payment',
        status: 'completed',
        sourceWalletId: payerWallet.id,
        destinationWalletId: merchantWallet.id,
        amount,
        feeAmount: 0,
        currency: 'AOA',
        provider: 'internal_qr',
        isDemo: Boolean(env.wallet.demoMode),
        idempotencyKey: scopedIdempotencyKey,
        description: lockedQr.description || `Pagamento por QR Code (${merchantWallet.account_code})`,
        initiatedByUserId: payerUser.id
      },
      client
    );

    await walletRepository.updateWalletBalances(
      payerWallet.id,
      { availableBalance: payerNewBalance },
      client
    );
    await walletRepository.updateWalletBalances(
      merchantWallet.id,
      { availableBalance: merchantNewBalance },
      client
    );

    await walletRepository.createLedgerEntry(
      {
        transactionId: tx.id,
        walletId: payerWallet.id,
        entryType: 'debit',
        amount,
        balanceAfter: payerNewBalance,
        description: `Pagamento QR (${merchantWallet.account_code})`
      },
      client
    );

    await walletRepository.createLedgerEntry(
      {
        transactionId: tx.id,
        walletId: merchantWallet.id,
        entryType: 'credit',
        amount,
        balanceAfter: merchantNewBalance,
        description: `Recebimento QR (${payerWallet.account_code})`
      },
      client
    );

    await walletRepository.markQrUsed(lockedQr.id, tx.id, client);

    return {
      transaction: tx,
      payerBalance: payerNewBalance
    };
  });

  await recordAuditLog({
    actorUserId: payerUser.id,
    action: 'wallet.qr_payment',
    entityType: 'wallet_transaction',
    entityId: txResult.transaction.id,
    ipAddress: requestMeta.ip,
    userAgent: requestMeta.userAgent,
    metadata: { amount, qrId: qrRecord.id }
  });

  return txResult;
}

async function payBookingWithinTransaction(
  client,
  { userId, companyId, bookingId, bookingReference, amount, paymentMethod = 'wallet', idempotencyKey = null }
) {
  if (paymentMethod === 'internal_demo' && !env.wallet.demoMode) {
    throw ApiError.forbidden('Pagamentos internos de demonstração estão desativados.');
  }

  const userWalletLookup = await ensureUserWallet(userId, client);
  const companyWalletLookup = await ensureCompanyWallet(companyId, client);
  const platformWalletLookup = await ensurePlatformWallet(client);

  const locked = await lockWalletsInOrder(client, [
    userWalletLookup.id,
    companyWalletLookup.id,
    platformWalletLookup.id
  ]);

  const userWallet = locked.get(String(userWalletLookup.id));
  const companyWallet = locked.get(String(companyWalletLookup.id));
  const platformWallet = locked.get(String(platformWalletLookup.id));

  const commissionPercent = Number(env.wallet.commissionPercent || 10);
  const commissionAmount = Number(((amount * commissionPercent) / 100).toFixed(2));
  const companyNetAmount = Number((amount - commissionAmount).toFixed(2));

  const isDemoSettlement = paymentMethod === 'internal_demo';

  if (!isDemoSettlement && Number(userWallet.available_balance) < amount) {
    throw ApiError.conflict(
      'Saldo disponível insuficiente na Carteira KWENDELA para concluir a reserva.',
      'INSUFFICIENT_BALANCE'
    );
  }

  const userNewBalance = isDemoSettlement
    ? Number(userWallet.available_balance)
    : Number((Number(userWallet.available_balance) - amount).toFixed(2));
  const companyNewBalance = Number((Number(companyWallet.available_balance) + companyNetAmount).toFixed(2));
  const platformNewBalance = Number((Number(platformWallet.available_balance) + commissionAmount).toFixed(2));

  const tx = await walletRepository.createTransaction(
    {
      referenceCode: `BKP-${generateRandomToken(4).toUpperCase()}`,
      transactionType: 'booking_payment',
      status: 'completed',
      sourceWalletId: userWallet.id,
      destinationWalletId: companyWallet.id,
      amount,
      feeAmount: commissionAmount,
      currency: 'AOA',
      provider: isDemoSettlement ? 'internal_demo' : 'internal_wallet',
      isDemo: isDemoSettlement || Boolean(env.wallet.demoMode),
      idempotencyKey,
      referenceType: 'booking',
      referenceId: bookingId,
      description: `Pagamento da reserva ${bookingReference}`,
      initiatedByUserId: userId,
      metadata: {
        bookingReference,
        commissionPercent,
        commissionAmount,
        companyNetAmount,
        isDemoSettlement
      }
    },
    client
  );

  if (!isDemoSettlement) {
    await walletRepository.updateWalletBalances(
      userWallet.id,
      { availableBalance: userNewBalance },
      client
    );
    await walletRepository.createLedgerEntry(
      {
        transactionId: tx.id,
        walletId: userWallet.id,
        entryType: 'debit',
        amount,
        balanceAfter: userNewBalance,
        description: `Pagamento reserva ${bookingReference}`
      },
      client
    );
  }

  await walletRepository.updateWalletBalances(
    companyWallet.id,
    { availableBalance: companyNewBalance },
    client
  );
  await walletRepository.createLedgerEntry(
    {
      transactionId: tx.id,
      walletId: companyWallet.id,
      entryType: 'credit',
      amount: companyNetAmount,
      balanceAfter: companyNewBalance,
      description: `Receita líquida reserva ${bookingReference}`
    },
    client
  );

  if (commissionAmount > 0) {
    await walletRepository.updateWalletBalances(
      platformWallet.id,
      { availableBalance: platformNewBalance },
      client
    );
    await walletRepository.createLedgerEntry(
      {
        transactionId: tx.id,
        walletId: platformWallet.id,
        entryType: 'credit',
        amount: commissionAmount,
        balanceAfter: platformNewBalance,
        description: `Comissão plataforma reserva ${bookingReference}`
      },
      client
    );
  }

  return tx;
}

async function refundBookingWithinTransaction(
  client,
  { bookingId, bookingReference, userId, companyId, amount }
) {
  const userWalletLookup = await ensureUserWallet(userId, client);
  const companyWalletLookup = await ensureCompanyWallet(companyId, client);
  const platformWalletLookup = await ensurePlatformWallet(client);

  const locked = await lockWalletsInOrder(client, [
    userWalletLookup.id,
    companyWalletLookup.id,
    platformWalletLookup.id
  ]);

  const userWallet = locked.get(String(userWalletLookup.id));
  const companyWallet = locked.get(String(companyWalletLookup.id));
  const platformWallet = locked.get(String(platformWalletLookup.id));

  const commissionPercent = Number(env.wallet.commissionPercent || 10);
  const commissionAmount = Number(((amount * commissionPercent) / 100).toFixed(2));
  const companyNetAmount = Number((amount - commissionAmount).toFixed(2));

  const userNewBalance = Number((Number(userWallet.available_balance) + amount).toFixed(2));
  const companyNewBalance = Number((Number(companyWallet.available_balance) - companyNetAmount).toFixed(2));
  const platformNewBalance = Number((Number(platformWallet.available_balance) - commissionAmount).toFixed(2));

  const tx = await walletRepository.createTransaction(
    {
      referenceCode: `RFD-${generateRandomToken(4).toUpperCase()}`,
      transactionType: 'refund',
      status: 'completed',
      sourceWalletId: companyWallet.id,
      destinationWalletId: userWallet.id,
      amount,
      feeAmount: commissionAmount,
      currency: 'AOA',
      provider: 'internal_wallet',
      isDemo: Boolean(env.wallet.demoMode),
      referenceType: 'booking',
      referenceId: bookingId,
      description: `Reembolso da reserva ${bookingReference}`,
      initiatedByUserId: userId
    },
    client
  );

  await walletRepository.updateWalletBalances(
    userWallet.id,
    { availableBalance: userNewBalance },
    client
  );
  await walletRepository.createLedgerEntry(
    {
      transactionId: tx.id,
      walletId: userWallet.id,
      entryType: 'credit',
      amount,
      balanceAfter: userNewBalance,
      description: `Reembolso reserva ${bookingReference}`
    },
    client
  );

  await walletRepository.updateWalletBalances(
    companyWallet.id,
    { availableBalance: companyNewBalance },
    client
  );
  await walletRepository.createLedgerEntry(
    {
      transactionId: tx.id,
      walletId: companyWallet.id,
      entryType: 'debit',
      amount: companyNetAmount,
      balanceAfter: companyNewBalance,
      description: `Estorno receita reserva ${bookingReference}`
    },
    client
  );

  if (commissionAmount > 0) {
    await walletRepository.updateWalletBalances(
      platformWallet.id,
      { availableBalance: platformNewBalance },
      client
    );
    await walletRepository.createLedgerEntry(
      {
        transactionId: tx.id,
        walletId: platformWallet.id,
        entryType: 'debit',
        amount: commissionAmount,
        balanceAfter: platformNewBalance,
        description: `Estorno comissão reserva ${bookingReference}`
      },
      client
    );
  }

  return tx;
}

async function paySubscriptionWithinTransaction(
  client,
  { companyId, actorUserId, planName, amount, paymentMethod = 'wallet', idempotencyKey = null }
) {
  if (paymentMethod === 'internal_demo' && !env.wallet.demoMode) {
    throw ApiError.forbidden('Pagamentos internos de demonstração estão desativados.');
  }

  const companyWalletLookup = await ensureCompanyWallet(companyId, client);
  const platformWalletLookup = await ensurePlatformWallet(client);

  const locked = await lockWalletsInOrder(client, [
    companyWalletLookup.id,
    platformWalletLookup.id
  ]);

  const companyWallet = locked.get(String(companyWalletLookup.id));
  const platformWallet = locked.get(String(platformWalletLookup.id));

  const isDemoSettlement = paymentMethod === 'internal_demo';

  if (!isDemoSettlement && Number(companyWallet.available_balance) < amount) {
    throw ApiError.conflict(
      'Saldo disponível insuficiente na carteira da empresa para pagar a assinatura.',
      'INSUFFICIENT_BALANCE'
    );
  }

  const companyNewBalance = isDemoSettlement
    ? Number(companyWallet.available_balance)
    : Number((Number(companyWallet.available_balance) - amount).toFixed(2));
  const platformNewBalance = Number((Number(platformWallet.available_balance) + amount).toFixed(2));

  const tx = await walletRepository.createTransaction(
    {
      referenceCode: `SUB-${generateRandomToken(4).toUpperCase()}`,
      transactionType: 'subscription_payment',
      status: 'completed',
      sourceWalletId: companyWallet.id,
      destinationWalletId: platformWallet.id,
      amount,
      feeAmount: 0,
      currency: 'AOA',
      provider: isDemoSettlement ? 'internal_demo' : 'internal_wallet',
      isDemo: isDemoSettlement || Boolean(env.wallet.demoMode),
      idempotencyKey,
      description: `Assinatura plano ${planName}`,
      initiatedByUserId: actorUserId
    },
    client
  );

  if (!isDemoSettlement) {
    await walletRepository.updateWalletBalances(
      companyWallet.id,
      { availableBalance: companyNewBalance },
      client
    );
    await walletRepository.createLedgerEntry(
      {
        transactionId: tx.id,
        walletId: companyWallet.id,
        entryType: 'debit',
        amount,
        balanceAfter: companyNewBalance,
        description: `Pagamento assinatura ${planName}`
      },
      client
    );
  }

  await walletRepository.updateWalletBalances(
    platformWallet.id,
    { availableBalance: platformNewBalance },
    client
  );
  await walletRepository.createLedgerEntry(
    {
      transactionId: tx.id,
      walletId: platformWallet.id,
      entryType: 'credit',
      amount,
      balanceAfter: platformNewBalance,
      description: `Receita assinatura ${planName}`
    },
    client
  );

  return tx;
}

async function purchasePremium(userId, payload, requestMeta = {}) {
  const tier = payload.tier === 'yearly' ? 'yearly' : 'monthly';
  const amount = PREMIUM_PRICING_KZ[tier];
  const durationDays = tier === 'yearly' ? 365 : 30;
  const paymentMethod = payload.paymentMethod || 'wallet';

  if (paymentMethod === 'internal_demo' && !env.wallet.demoMode) {
    throw ApiError.forbidden('Pagamentos internos de demonstração estão desativados.');
  }

  const scopedKey = payload.idempotencyKey
    ? `premium:${userId}:${payload.idempotencyKey}`
    : null;

  if (scopedKey) {
    const existing = await walletRepository.findTransactionByIdempotencyKey(scopedKey);
    if (existing) {
      return { transaction: existing, deduplicated: true };
    }
  }

  const result = await withTransaction(async (client) => {
    const userWalletLookup = await ensureUserWallet(userId, client);
    const platformWalletLookup = await ensurePlatformWallet(client);

    const locked = await lockWalletsInOrder(client, [
      userWalletLookup.id,
      platformWalletLookup.id
    ]);

    const userWallet = locked.get(String(userWalletLookup.id));
    const platformWallet = locked.get(String(platformWalletLookup.id));

    const isDemoSettlement = paymentMethod === 'internal_demo';

    if (!isDemoSettlement && Number(userWallet.available_balance) < amount) {
      throw ApiError.conflict(
        'Saldo disponível insuficiente para ativar KWENDELA Premium.',
        'INSUFFICIENT_BALANCE'
      );
    }

    const userNewBalance = isDemoSettlement
      ? Number(userWallet.available_balance)
      : Number((Number(userWallet.available_balance) - amount).toFixed(2));
    const platformNewBalance = Number((Number(platformWallet.available_balance) + amount).toFixed(2));

    const tx = await walletRepository.createTransaction(
      {
        referenceCode: `PRM-${generateRandomToken(4).toUpperCase()}`,
        transactionType: 'premium_payment',
        status: 'completed',
        sourceWalletId: userWallet.id,
        destinationWalletId: platformWallet.id,
        amount,
        feeAmount: 0,
        currency: 'AOA',
        provider: isDemoSettlement ? 'internal_demo' : 'internal_wallet',
        isDemo: isDemoSettlement || Boolean(env.wallet.demoMode),
        idempotencyKey: scopedKey,
        description: `Subscrição KWENDELA Premium (${tier})`,
        initiatedByUserId: userId
      },
      client
    );

    if (!isDemoSettlement) {
      await walletRepository.updateWalletBalances(
        userWallet.id,
        { availableBalance: userNewBalance },
        client
      );
      await walletRepository.createLedgerEntry(
        {
          transactionId: tx.id,
          walletId: userWallet.id,
          entryType: 'debit',
          amount,
          balanceAfter: userNewBalance,
          description: `KWENDELA Premium (${tier})`
        },
        client
      );
    }

    await walletRepository.updateWalletBalances(
      platformWallet.id,
      { availableBalance: platformNewBalance },
      client
    );
    await walletRepository.createLedgerEntry(
      {
        transactionId: tx.id,
        walletId: platformWallet.id,
        entryType: 'credit',
        amount,
        balanceAfter: platformNewBalance,
        description: `Receita KWENDELA Premium (${tier})`
      },
      client
    );

    const updatedUser = await userRepository.activatePremium(userId, durationDays, client);

    return {
      transaction: tx,
      premiumExpiresAt: updatedUser.premium_expires_at,
      availableBalance: userNewBalance
    };
  });

  await recordAuditLog({
    actorUserId: userId,
    action: 'wallet.purchase_premium',
    entityType: 'wallet_transaction',
    entityId: result.transaction.id,
    ipAddress: requestMeta.ip,
    userAgent: requestMeta.userAgent,
    metadata: { tier, amount }
  });

  return result;
}

module.exports = {
  PREMIUM_PRICING_KZ,
  getMyWalletSummary,
  listMyTransactions,
  demoTopup,
  transferFunds,
  createQrPaymentRequest,
  payQrCode,
  payBookingWithinTransaction,
  refundBookingWithinTransaction,
  paySubscriptionWithinTransaction,
  purchasePremium
};