'use strict';

const { withTransaction } = require('../config/database');
const ApiError = require('../utils/ApiError');
const { hashPassword, generateAccountCode } = require('../utils/crypto');
const { buildPaginationMeta } = require('../utils/pagination');
const { recordAuditLog } = require('../middlewares/audit.middleware');
const companyRepository = require('../repositories/company.repository');
const userRepository = require('../repositories/user.repository');
const planRepository = require('../repositories/plan.repository');
const walletRepository = require('../repositories/wallet.repository');
const walletService = require('./wallet.service');
const notificationService = require('./notification.service');

const ROLE_MAP = {
  admin: 'company_admin',
  manager: 'company_staff',
  guide: 'guide',
  staff: 'company_staff'
};

async function getCompanyDashboard(companyId) {
  const [company, metrics, activePlan] = await Promise.all([
    companyRepository.findById(companyId),
    companyRepository.getDashboardMetrics(companyId),
    planRepository.findActiveSubscriptionWithPlan(companyId)
  ]);

  if (!company) {
    throw ApiError.notFound('Empresa não encontrada.');
  }

  return {
    company,
    metrics,
    subscription: activePlan ? activePlan.subscription : null,
    plan: activePlan ? activePlan.plan : null
  };
}

async function getCompanyProfile(companyId) {
  const company = await companyRepository.findDetailedById(companyId);
  if (!company) {
    throw ApiError.notFound('Empresa não encontrada.');
  }
  return company;
}

async function updateCompanyProfile(companyId, payload, actor, requestMeta = {}) {
  const existing = await companyRepository.findById(companyId);
  if (!existing) {
    throw ApiError.notFound('Empresa não encontrada.');
  }

  const updated = await companyRepository.updateCompany(companyId, payload);

  await recordAuditLog({
    actorUserId: actor.id,
    companyId,
    action: 'company.update_profile',
    entityType: 'company',
    entityId: companyId,
    ipAddress: requestMeta.ip,
    userAgent: requestMeta.userAgent,
    metadata: { updatedFields: Object.keys(payload) }
  });

  return updated;
}

async function updateCompanyMedia(companyId, { logoUrl, coverUrl }, actor) {
  const updated = await companyRepository.updateCompanyMedia(companyId, { logoUrl, coverUrl });
  if (!updated) {
    throw ApiError.notFound('Empresa não encontrada.');
  }

  await recordAuditLog({
    actorUserId: actor.id,
    companyId,
    action: 'company.update_media',
    entityType: 'company',
    entityId: companyId
  });

  return updated;
}

async function listTeamMembers(companyId) {
  return companyRepository.findTeamMembers(companyId);
}

async function addTeamMember(companyId, payload, actor, requestMeta = {}) {
  const existingUser = await userRepository.findByEmail(payload.email);

  const member = await withTransaction(async (client) => {
    let targetUser = existingUser;

    if (!targetUser) {
      if (!payload.initialPassword) {
        throw ApiError.badRequest(
          'É obrigatório definir uma palavra-passe inicial para novos utilizadores.'
        );
      }

      const passwordHash = await hashPassword(payload.initialPassword);
      const userRole = ROLE_MAP[payload.companyRole] || 'company_staff';

      targetUser = await userRepository.createUser(
        {
          fullName: payload.fullName,
          email: payload.email,
          phone: payload.phone || null,
          passwordHash,
          role: userRole,
          status: 'active',
          mustChangePassword: true,
          preferredLanguage: 'pt'
        },
        client
      );

      await walletRepository.createWallet(
        {
          ownerType: 'user',
          ownerUserId: targetUser.id,
          accountCode: generateAccountCode('KWD'),
          currency: 'AOA'
        },
        client
      );
    } else {
      const existingMembership = await companyRepository.findMembership(
        companyId,
        targetUser.id,
        client
      );
      if (existingMembership) {
        throw ApiError.conflict('Este utilizador já faz parte da equipa da empresa.');
      }
      if (targetUser.role === 'superadmin') {
        throw ApiError.forbidden('Não é possível associar uma conta Superadmin à equipa.');
      }
    }

    return companyRepository.addMember(
      {
        companyId,
        userId: targetUser.id,
        role: payload.companyRole || 'staff',
        isActive: true
      },
      client
    );
  });

  await recordAuditLog({
    actorUserId: actor.id,
    companyId,
    action: 'company.add_team_member',
    entityType: 'company_member',
    entityId: member.id,
    ipAddress: requestMeta.ip,
    userAgent: requestMeta.userAgent,
    metadata: {
      email: payload.email,
      companyRole: payload.companyRole
    }
  });

  return member;
}

async function updateTeamMember(companyId, memberId, payload, actor, requestMeta = {}) {
  const existing = await companyRepository.findMembershipById(companyId, memberId);
  if (!existing) {
    throw ApiError.notFound('Membro da equipa não encontrado.');
  }

  if (existing.role === 'owner' && (payload.isActive === false || (payload.companyRole && payload.companyRole !== 'owner'))) {
    throw ApiError.badRequest('Não é possível desativar ou rebaixar o proprietário principal da empresa.');
  }

  const updated = await companyRepository.updateMember(companyId, memberId, payload);

  await recordAuditLog({
    actorUserId: actor.id,
    companyId,
    action: 'company.update_team_member',
    entityType: 'company_member',
    entityId: memberId,
    ipAddress: requestMeta.ip,
    userAgent: requestMeta.userAgent,
    metadata: payload
  });

  return updated;
}

async function listGuides(companyId) {
  return companyRepository.findGuides(companyId);
}

async function createGuide(companyId, payload, actor) {
  const guide = await companyRepository.createGuide(companyId, payload);

  await recordAuditLog({
    actorUserId: actor.id,
    companyId,
    action: 'company.create_guide',
    entityType: 'guide',
    entityId: guide.id
  });

  return guide;
}

async function updateGuide(companyId, guideId, payload, actor) {
  const updated = await companyRepository.updateGuide(companyId, guideId, payload);
  if (!updated) {
    throw ApiError.notFound('Guia turístico não encontrado para esta empresa.');
  }

  await recordAuditLog({
    actorUserId: actor.id,
    companyId,
    action: 'company.update_guide',
    entityType: 'guide',
    entityId: guideId
  });

  return updated;
}

async function listTransports(companyId) {
  return companyRepository.findTransports(companyId);
}

async function createTransport(companyId, payload, actor) {
  const transport = await companyRepository.createTransport(companyId, payload);

  await recordAuditLog({
    actorUserId: actor.id,
    companyId,
    action: 'company.create_transport',
    entityType: 'transport',
    entityId: transport.id
  });

  return transport;
}

async function updateTransport(companyId, transportId, payload, actor) {
  const updated = await companyRepository.updateTransport(companyId, transportId, payload);
  if (!updated) {
    throw ApiError.notFound('Transporte não encontrado para esta empresa.');
  }

  await recordAuditLog({
    actorUserId: actor.id,
    companyId,
    action: 'company.update_transport',
    entityType: 'transport',
    entityId: transportId
  });

  return updated;
}

async function getCompanyFinanceSummary(companyId, pagination) {
  const wallet = await walletRepository.findByCompanyId(companyId);
  if (!wallet) {
    throw ApiError.notFound('Carteira da empresa não encontrada.');
  }

  const { items, total } = await walletRepository.findTransactionsByWalletId(
    wallet.id,
    {},
    pagination
  );

  return {
    wallet,
    transactions: items,
    pagination: buildPaginationMeta({
      page: pagination.page,
      limit: pagination.limit,
      total
    })
  };
}

async function getCompanyReports(companyId, filters = {}) {
  return companyRepository.getOperationalReports(companyId, filters);
}

async function getCompanySubscription(companyId) {
  const [active, history, availablePlans] = await Promise.all([
    planRepository.findActiveSubscriptionWithPlan(companyId),
    planRepository.findCompanySubscriptionHistory(companyId),
    planRepository.findAll({ includeInactive: false })
  ]);

  return {
    activeSubscription: active ? active.subscription : null,
    activePlan: active ? active.plan : null,
    history,
    availablePlans
  };
}

async function changeCompanySubscription(companyId, payload, actor, requestMeta = {}) {
  const plan = await planRepository.findById(payload.planId);
  if (!plan || !plan.is_active) {
    throw ApiError.badRequest('O plano escolhido não existe ou está inativo.');
  }

  const durationMonths = Number(payload.durationMonths || 1);
  const totalAmountKz = Number((Number(plan.price_kz) * durationMonths).toFixed(2));

  const subscription = await withTransaction(async (client) => {
    if (totalAmountKz > 0) {
      await walletService.paySubscriptionWithinTransaction(client, {
        companyId,
        actorUserId: actor.id,
        planName: plan.name,
        amount: totalAmountKz,
        paymentMethod: payload.paymentMethod || 'wallet',
        idempotencyKey: payload.idempotencyKey || null
      });
    }

    await planRepository.cancelActiveSubscriptions(companyId, client);

    return planRepository.createCompanySubscription(
      {
        companyId,
        planId: plan.id,
        status: 'active',
        durationMonths,
        priceKz: totalAmountKz,
        autoRenew: false,
        assignedByUserId: actor.id,
        notes: `Subscrição efetuada via Portal Empresarial (${payload.paymentMethod || 'wallet'}).`
      },
      client
    );
  });

  await recordAuditLog({
    actorUserId: actor.id,
    companyId,
    action: 'company.change_subscription',
    entityType: 'company_subscription',
    entityId: subscription.id,
    ipAddress: requestMeta.ip,
    userAgent: requestMeta.userAgent,
    metadata: {
      planId: plan.id,
      planCode: plan.code,
      durationMonths,
      totalAmountKz
    }
  });

  await notificationService.notifyCompanyAdmins(companyId, {
    type: 'subscription_activated',
    title: 'Plano empresarial atualizado',
    message: `O plano ${plan.name} encontra-se ativo por ${durationMonths} mês(es).`,
    referenceType: 'company_subscription',
    referenceId: subscription.id
  });

  return subscription;
}

module.exports = {
  getCompanyDashboard,
  getCompanyProfile,
  updateCompanyProfile,
  updateCompanyMedia,
  listTeamMembers,
  addTeamMember,
  updateTeamMember,
  listGuides,
  createGuide,
  updateGuide,
  listTransports,
  createTransport,
  updateTransport,
  getCompanyFinanceSummary,
  getCompanyReports,
  getCompanySubscription,
  changeCompanySubscription
};