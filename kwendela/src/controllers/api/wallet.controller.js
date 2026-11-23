'use strict';

const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/ApiResponse');
const { parsePagination } = require('../../utils/pagination');
const walletService = require('../../services/wallet.service');

function extractRequestMeta(req) {
  return {
    ip: req.ip || (req.connection && req.connection.remoteAddress) || null,
    userAgent: req.get('user-agent') || null
  };
}

const getMyWallet = asyncHandler(async (req, res) => {
  const summary = await walletService.getMyWalletSummary(req.user);
  return ApiResponse.success(res, summary, 'Resumo da carteira obtido com sucesso.');
});

const listMyTransactions = asyncHandler(async (req, res) => {
  const pagination = parsePagination(req.query, { defaultLimit: 20 });
  const filters = {
    type: req.query.type,
    status: req.query.status,
    startDate: req.query.startDate,
    endDate: req.query.endDate
  };

  const result = await walletService.listMyTransactions(req.user.id, filters, pagination);
  return ApiResponse.success(
    res,
    {
      wallet: result.wallet,
      transactions: result.items
    },
    'Movimentos da carteira obtidos com sucesso.',
    200,
    { pagination: result.pagination }
  );
});

const demoTopup = asyncHandler(async (req, res) => {
  const result = await walletService.demoTopup(req.user, req.body, extractRequestMeta(req));
  return ApiResponse.created(
    res,
    result,
    'Carregamento interno de demonstração efetuado com sucesso.'
  );
});

const transferFunds = asyncHandler(async (req, res) => {
  const result = await walletService.transferFunds(req.user, req.body, extractRequestMeta(req));
  return ApiResponse.created(res, result, 'Transferência interna concluída com sucesso.');
});

const createQrPaymentRequest = asyncHandler(async (req, res) => {
  const result = await walletService.createQrPaymentRequest(req.user, req.body);
  return ApiResponse.created(res, result, 'Código QR de pagamento gerado com sucesso.');
});

const payQrCode = asyncHandler(async (req, res) => {
  const result = await walletService.payQrCode(req.user, req.body, extractRequestMeta(req));
  return ApiResponse.created(res, result, 'Pagamento por QR Code concluído com sucesso.');
});

const purchasePremium = asyncHandler(async (req, res) => {
  const result = await walletService.purchasePremium(
    req.user.id,
    req.body,
    extractRequestMeta(req)
  );
  return ApiResponse.created(res, result, 'KWENDELA Premium ativado com sucesso.');
});

module.exports = {
  getMyWallet,
  listMyTransactions,
  demoTopup,
  transferFunds,
  createQrPaymentRequest,
  payQrCode,
  purchasePremium
};