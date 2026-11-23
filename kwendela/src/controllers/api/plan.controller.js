'use strict';

const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/ApiResponse');
const planService = require('../../services/plan.service');

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const listPlans = asyncHandler(async (_req, res) => {
  const plans = await planService.listAvailablePlans();
  return ApiResponse.success(res, plans, 'Planos empresariais obtidos com sucesso.');
});

const getPlanDetail = asyncHandler(async (req, res) => {
  const { idOrCode } = req.params;
  const plan = UUID_REGEX.test(String(idOrCode))
    ? await planService.getPlanById(idOrCode)
    : await planService.getPlanByCode(idOrCode);

  return ApiResponse.success(res, plan, 'Detalhes do plano obtidos com sucesso.');
});

const getCompanyPlanUsage = asyncHandler(async (req, res) => {
  const usage = await planService.getCompanyPlanUsage(req.company.id);
  return ApiResponse.success(res, usage, 'Consumo do plano empresarial obtido com sucesso.');
});

module.exports = {
  listPlans,
  getPlanDetail,
  getCompanyPlanUsage
};
