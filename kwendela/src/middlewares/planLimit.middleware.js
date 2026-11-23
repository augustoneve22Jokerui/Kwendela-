'use strict';

const ApiError = require('../utils/ApiError');
const planRepository = require('../repositories/plan.repository');

const RESOURCE_LABELS = {
  users: 'utilizadores na equipa',
  experiences: 'experiências publicadas',
  destinations: 'destinos geridos',
  expeditions: 'expedições ativas'
};

async function loadActivePlanContext(req) {
  if (req.companyPlan && req.activeSubscription) {
    return {
      subscription: req.activeSubscription,
      plan: req.companyPlan
    };
  }

  const companyId =
    (req.company && req.company.id) ||
    (req.user && req.user.companyId) ||
    (req.params && req.params.companyId);

  if (!companyId) {
    throw ApiError.forbidden(
      'Empresa não identificada para validação de plano.',
      'COMPANY_CONTEXT_REQUIRED'
    );
  }

  const active = await planRepository.findActiveSubscriptionWithPlan(companyId);
  if (!active) {
    throw ApiError.forbidden(
      'A empresa não possui uma assinatura de plano ativa. Regularize ou selecione um plano KWENDELA.',
      'ACTIVE_SUBSCRIPTION_REQUIRED'
    );
  }

  req.activeSubscription = active.subscription;
  req.companyPlan = active.plan;

  return active;
}

function requireActiveSubscription() {
  return async function activeSubscriptionMiddleware(req, res, next) {
    try {
      await loadActivePlanContext(req);
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

function resolveNumericLimit(plan, resourceKey) {
  const limitsJson = plan.limits && typeof plan.limits === 'object' ? plan.limits : {};

  switch (resourceKey) {
    case 'users':
      return plan.max_users !== undefined ? plan.max_users : limitsJson.maxUsers;
    case 'experiences':
      return plan.max_experiences !== undefined ? plan.max_experiences : limitsJson.maxExperiences;
    case 'destinations':
      return plan.max_destinations !== undefined ? plan.max_destinations : limitsJson.maxDestinations;
    case 'expeditions':
      return limitsJson.maxExpeditions !== undefined ? limitsJson.maxExpeditions : null;
    default:
      return limitsJson[resourceKey] !== undefined ? limitsJson[resourceKey] : null;
  }
}

function checkPlanLimit(resourceKey) {
  return async function planLimitMiddleware(req, res, next) {
    try {
      const { plan } = await loadActivePlanContext(req);
      const companyId =
        (req.company && req.company.id) ||
        (req.user && req.user.companyId) ||
        (req.params && req.params.companyId);

      const maxAllowed = resolveNumericLimit(plan, resourceKey);

      if (maxAllowed === null || maxAllowed === undefined || Number(maxAllowed) < 0) {
        return next();
      }

      const currentCount = await planRepository.countCompanyResourceUsage(companyId, resourceKey);

      if (Number(currentCount) >= Number(maxAllowed)) {
        const label = RESOURCE_LABELS[resourceKey] || resourceKey;
        return next(
          ApiError.forbidden(
            `Limite do plano ${plan.name} atingido: máximo de ${maxAllowed} ${label}. Efetue upgrade do seu plano para continuar.`,
            'PLAN_LIMIT_REACHED',
            {
              planCode: plan.code,
              planName: plan.name,
              resource: resourceKey,
              currentCount: Number(currentCount),
              maxAllowed: Number(maxAllowed)
            }
          )
        );
      }

      return next();
    } catch (err) {
      return next(err);
    }
  };
}

function requirePlanFeature(featureKey) {
  return async function planFeatureMiddleware(req, res, next) {
    try {
      const { plan } = await loadActivePlanContext(req);
      const features = plan.features && typeof plan.features === 'object' ? plan.features : {};

      if (!features[featureKey]) {
        return next(
          ApiError.forbidden(
            `A funcionalidade "${featureKey}" não está incluída no plano ${plan.name}.`,
            'PLAN_FEATURE_UNAVAILABLE',
            {
              planCode: plan.code,
              planName: plan.name,
              requiredFeature: featureKey
            }
          )
        );
      }

      return next();
    } catch (err) {
      return next(err);
    }
  };
}

module.exports = {
  requireActiveSubscription,
  checkPlanLimit,
  requirePlanFeature
};