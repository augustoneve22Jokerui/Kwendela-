'use strict';

const ApiError = require('../utils/ApiError');
const planRepository = require('../repositories/plan.repository');

async function listAvailablePlans() {
  return planRepository.findAll({ includeInactive: false });
}

async function getPlanById(planId) {
  const plan = await planRepository.findById(planId);
  if (!plan) {
    throw ApiError.notFound('Plano empresarial não encontrado.');
  }
  return plan;
}

async function getPlanByCode(code) {
  const plan = await planRepository.findByCode(code);
  if (!plan) {
    throw ApiError.notFound('Plano empresarial não encontrado.');
  }
  return plan;
}

async function getCompanyPlanUsage(companyId) {
  const active = await planRepository.findActiveSubscriptionWithPlan(companyId);
  if (!active) {
    return {
      hasActiveSubscription: false,
      subscription: null,
      plan: null,
      usage: null
    };
  }

  const [usersCount, experiencesCount, destinationsCount, expeditionsCount] = await Promise.all([
    planRepository.countCompanyResourceUsage(companyId, 'users'),
    planRepository.countCompanyResourceUsage(companyId, 'experiences'),
    planRepository.countCompanyResourceUsage(companyId, 'destinations'),
    planRepository.countCompanyResourceUsage(companyId, 'expeditions')
  ]);

  const { plan, subscription } = active;
  const limits = plan.limits && typeof plan.limits === 'object' ? plan.limits : {};

  return {
    hasActiveSubscription: true,
    subscription,
    plan,
    usage: {
      users: {
        used: Number(usersCount),
        limit: plan.max_users !== undefined ? plan.max_users : limits.maxUsers ?? null
      },
      experiences: {
        used: Number(experiencesCount),
        limit: plan.max_experiences !== undefined ? plan.max_experiences : limits.maxExperiences ?? null
      },
      destinations: {
        used: Number(destinationsCount),
        limit: plan.max_destinations !== undefined ? plan.max_destinations : limits.maxDestinations ?? null
      },
      expeditions: {
        used: Number(expeditionsCount),
        limit: limits.maxExpeditions ?? null
      }
    }
  };
}

module.exports = {
  listAvailablePlans,
  getPlanById,
  getPlanByCode,
  getCompanyPlanUsage
};