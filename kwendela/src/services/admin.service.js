'use strict';

const { withTransaction } = require('../config/database');
const ApiError = require('../utils/ApiError');
const { hashPassword, generateAccountCode } = require('../utils/crypto');
const { generateUniqueSlug } = require('../utils/slug');
const { buildPaginationMeta } = require('../utils/pagination');
const { recordAuditLog } = require('../middlewares/audit.middleware');
const adminRepository = require('../repositories/admin.repository');
const userRepository = require('../repositories/user.repository');
const companyRepository = require('../repositories/company.repository');
const planRepository = require('../repositories/plan.repository');
const walletRepository = require('../repositories/wallet.repository');
const notificationService = require('./notification.service');

async function getDashboardOverview() {
  return adminRepository.getOverviewMetrics();
}

async function createCompanyAccount(payload, actor, requestMeta = {}) {
  const existingUser = await userRepository.findByEmail(payload.ownerEmail);
  if (existingUser) {
    throw ApiError.conflict(
      'Já existe uma conta registada com o email indicado para o responsável da empresa.',
      null,
      'EMAIL_ALREADY_EXISTS'
    );
  }

  const plan = await planRepository.findById(payload.planId);
  if (!plan || !plan.is_active) {
    throw ApiError.badRequest('O plano selecionado não existe ou está inativo.');
  }

  const passwordHash = await hashPassword(payload.initialPassword);
  const companySlug = generateUniqueSlug(payload.companyName);
  const userWalletCode = generateAccountCode('KWD');
  const companyWalletCode = generateAccountCode('KWC');
  const durationMonths = Number(payload.durationMonths || 1);

  const created = await withTransaction(async (client) => {
    const ownerUser = await userRepository.createUser(
      {
        fullName: payload.ownerName,
        email: payload.ownerEmail,
        phone: payload.ownerPhone || payload.companyPhone,
        passwordHash,
        role: 'company_owner',
        status: 'active',
        mustChangePassword: true,
        preferredLanguage: 'pt'
      },
      client
    );

    const company = await companyRepository.createCompany(
      {
        ownerUserId: ownerUser.id,
        name: payload.companyName,
        slug: companySlug,
        legalName: payload.legalName || payload.companyName,
        taxId: payload.taxId || null,
        email: payload.companyEmail,
        phone: payload.companyPhone,
        province: payload.province,
        city: payload.city,
        address: payload.address || null,
        description: payload.description || null,
        status: 'active',
        isVerified: Boolean(payload.isVerified)
      },
      client
    );

    await companyRepository.addMember(
      {
        companyId: company.id,
        userId: ownerUser.id,
        role: 'owner',
        isActive: true
      },
      client
    );

    const subscription = await planRepository.createCompanySubscription(
      {
        companyId: company.id,
        planId: plan.id,
        status: 'active',
        durationMonths,
        priceKz: plan.price_kz,
        autoRenew: false,
        assignedByUserId: actor.id,
        notes: 'Assinatura inicial atribuída pelo Superadministrador.'
      },
      client
    );

    await walletRepository.createWallet(
      {
        ownerType: 'user',
        ownerUserId: ownerUser.id,
        accountCode: userWalletCode,
        currency: 'AOA'
      },
      client
    );

    await walletRepository.createWallet(
      {
        ownerType: 'company',
        ownerCompanyId: company.id,
        accountCode: companyWalletCode,
        currency: 'AOA'
      },
      client
    );

    return {
      company,
      owner: {
        id: ownerUser.id,
        fullName: ownerUser.full_name,
        email: ownerUser.email,
        role: ownerUser.role,
        mustChangePassword: true
      },
      subscription,
      plan: {
        id: plan.id,
        code: plan.code,
        name: plan.name
      }
    };
  });

  await recordAuditLog({
    actorUserId: actor.id,
    companyId: created.company.id,
    action: 'admin.create_company_account',
    entityType: 'company',
    entityId: created.company.id,
    ipAddress: requestMeta.ip,
    userAgent: requestMeta.userAgent,
    metadata: {
      companyName: created.company.name,
      ownerEmail: created.owner.email,
      planCode: created.plan.code,
      durationMonths
    }
  });

  await notificationService.createNotification({
    userId: created.owner.id,
    type: 'company_account_created',
    title: 'Bem-vindo ao Portal Empresarial KWENDELA',
    message: `A conta da empresa ${created.company.name} foi criada com o plano ${created.plan.name}. Por segurança, altere a palavra-passe inicial no primeiro acesso.`,
    referenceType: 'company',
    referenceId: created.company.id
  });

  return created;
}

async function listCompanies(filters, pagination) {
  const { items, total } = await companyRepository.findAllAdmin(filters, pagination);
  return {
    items,
    pagination: buildPaginationMeta({
      page: pagination.page,
      limit: pagination.limit,
      total
    })
  };
}

async function getCompanyDetails(companyId) {
  const company = await companyRepository.findDetailedById(companyId);
  if (!company) {
    throw ApiError.notFound('Empresa não encontrada.');
  }
  return company;
}

async function updateCompanyStatus(companyId, payload, actor, requestMeta = {}) {
  const existing = await companyRepository.findById(companyId);
  if (!existing) {
    throw ApiError.notFound('Empresa não encontrada.');
  }

  const updated = await companyRepository.updateStatus(companyId, {
    status: payload.status,
    isVerified:
      payload.isVerified !== undefined ? payload.isVerified : existing.is_verified
  });

  await recordAuditLog({
    actorUserId: actor.id,
    companyId,
    action: 'admin.update_company_status',
    entityType: 'company',
    entityId: companyId,
    ipAddress: requestMeta.ip,
    userAgent: requestMeta.userAgent,
    metadata: {
      previousStatus: existing.status,
      newStatus: payload.status,
      isVerified: updated.is_verified,
      reason: payload.reason || null
    }
  });

  await notificationService.notifyCompanyAdmins(companyId, {
    type: 'company_status_updated',
    title: 'Estado da empresa atualizado',
    message: `O estado da empresa ${updated.name} foi alterado para "${updated.status}".${payload.reason ? ` Motivo: ${payload.reason}` : ''}`,
    referenceType: 'company',
    referenceId: companyId
  });

  return updated;
}

async function assignCompanyPlan(companyId, payload, actor, requestMeta = {}) {
  const company = await companyRepository.findById(companyId);
  if (!company) {
    throw ApiError.notFound('Empresa não encontrada.');
  }

  const plan = await planRepository.findById(payload.planId);
  if (!plan || !plan.is_active) {
    throw ApiError.badRequest('O plano selecionado não existe ou está inativo.');
  }

  const subscription = await withTransaction(async (client) => {
    await planRepository.cancelActiveSubscriptions(companyId, client);
    return planRepository.createCompanySubscription(
      {
        companyId,
        planId: plan.id,
        status: 'active',
        durationMonths: Number(payload.durationMonths || 1),
        priceKz: plan.price_kz,
        autoRenew: Boolean(payload.autoRenew),
        assignedByUserId: actor.id,
        notes: payload.notes || 'Plano atualizado pelo Superadministrador.'
      },
      client
    );
  });

  await recordAuditLog({
    actorUserId: actor.id,
    companyId,
    action: 'admin.assign_company_plan',
    entityType: 'company_subscription',
    entityId: subscription.id,
    ipAddress: requestMeta.ip,
    userAgent: requestMeta.userAgent,
    metadata: {
      planId: plan.id,
      planCode: plan.code,
      durationMonths: payload.durationMonths || 1
    }
  });

  await notificationService.notifyCompanyAdmins(companyId, {
    type: 'company_plan_assigned',
    title: 'Plano empresarial atualizado',
    message: `Foi atribuído o plano ${plan.name} à empresa ${company.name}.`,
    referenceType: 'company_subscription',
    referenceId: subscription.id
  });

  return subscription;
}

async function listPlans() {
  return planRepository.findAll({ includeInactive: true });
}

async function updatePlan(planId, payload, actor, requestMeta = {}) {
  const existing = await planRepository.findById(planId);
  if (!existing) {
    throw ApiError.notFound('Plano não encontrado.');
  }

  const updated = await planRepository.updatePlan(planId, payload);

  await recordAuditLog({
    actorUserId: actor.id,
    action: 'admin.update_plan',
    entityType: 'plan',
    entityId: planId,
    ipAddress: requestMeta.ip,
    userAgent: requestMeta.userAgent,
    metadata: {
      planCode: updated.code,
      updatedFields: Object.keys(payload)
    }
  });

  return updated;
}

async function listSubscriptions(filters, pagination) {
  const { items, total } = await planRepository.findAllSubscriptions(filters, pagination);
  return {
    items,
    pagination: buildPaginationMeta({
      page: pagination.page,
      limit: pagination.limit,
      total
    })
  };
}

async function listPayments(filters, pagination) {
  const { items, total } = await adminRepository.findAllFinancialOperations(filters, pagination);
  return {
    items,
    pagination: buildPaginationMeta({
      page: pagination.page,
      limit: pagination.limit,
      total
    })
  };
}

async function listUsers(filters, pagination) {
  const { items, total } = await userRepository.findAllAdmin(filters, pagination);
  return {
    items,
    pagination: buildPaginationMeta({
      page: pagination.page,
      limit: pagination.limit,
      total
    })
  };
}

async function updateUserStatus(userId, payload, actor, requestMeta = {}) {
  if (String(userId) === String(actor.id)) {
    throw ApiError.badRequest('Não é possível alterar o estado da sua própria conta Superadmin.');
  }

  const existing = await userRepository.findById(userId);
  if (!existing) {
    throw ApiError.notFound('Utilizador não encontrado.');
  }

  const updated = await userRepository.updateStatus(userId, payload.status);

  await recordAuditLog({
    actorUserId: actor.id,
    action: 'admin.update_user_status',
    entityType: 'user',
    entityId: userId,
    ipAddress: requestMeta.ip,
    userAgent: requestMeta.userAgent,
    metadata: {
      previousStatus: existing.status,
      newStatus: payload.status,
      reason: payload.reason || null
    }
  });

  return updated;
}

async function listDestinationsForModeration(filters, pagination) {
  const { items, total } = await adminRepository.findDestinationsForModeration(filters, pagination);
  return {
    items,
    pagination: buildPaginationMeta({
      page: pagination.page,
      limit: pagination.limit,
      total
    })
  };
}

async function moderateDestination(destinationId, payload, actor, requestMeta = {}) {
  const updated = await adminRepository.updateDestinationModeration(destinationId, {
    moderationStatus: payload.moderationStatus,
    moderationNotes: payload.moderationNotes || null,
    moderatedByUserId: actor.id
  });

  if (!updated) {
    throw ApiError.notFound('Destino não encontrado.');
  }

  await recordAuditLog({
    actorUserId: actor.id,
    companyId: updated.company_id || null,
    action: 'admin.moderate_destination',
    entityType: 'destination',
    entityId: destinationId,
    ipAddress: requestMeta.ip,
    userAgent: requestMeta.userAgent,
    metadata: {
      moderationStatus: payload.moderationStatus,
      moderationNotes: payload.moderationNotes || null
    }
  });

  return updated;
}

async function listExperiencesForModeration(filters, pagination) {
  const { items, total } = await adminRepository.findExperiencesForModeration(filters, pagination);
  return {
    items,
    pagination: buildPaginationMeta({
      page: pagination.page,
      limit: pagination.limit,
      total
    })
  };
}

async function moderateExperience(experienceId, payload, actor, requestMeta = {}) {
  const updated = await adminRepository.updateExperienceModeration(experienceId, {
    moderationStatus: payload.moderationStatus,
    moderationNotes: payload.moderationNotes || null,
    moderatedByUserId: actor.id
  });

  if (!updated) {
    throw ApiError.notFound('Experiência não encontrada.');
  }

  await recordAuditLog({
    actorUserId: actor.id,
    companyId: updated.company_id || null,
    action: 'admin.moderate_experience',
    entityType: 'experience',
    entityId: experienceId,
    ipAddress: requestMeta.ip,
    userAgent: requestMeta.userAgent,
    metadata: {
      moderationStatus: payload.moderationStatus,
      moderationNotes: payload.moderationNotes || null
    }
  });

  return updated;
}

async function listBookings(filters, pagination) {
  const { items, total } = await adminRepository.findAllBookings(filters, pagination);
  return {
    items,
    pagination: buildPaginationMeta({
      page: pagination.page,
      limit: pagination.limit,
      total
    })
  };
}

async function listReports(filters, pagination) {
  const { items, total } = await adminRepository.findAllReports(filters, pagination);
  return {
    items,
    pagination: buildPaginationMeta({
      page: pagination.page,
      limit: pagination.limit,
      total
    })
  };
}

async function resolveReport(reportId, payload, actor, requestMeta = {}) {
  const updated = await adminRepository.updateReportStatus(reportId, {
    status: payload.status,
    resolutionNotes: payload.resolutionNotes,
    resolvedByUserId: actor.id
  });

  if (!updated) {
    throw ApiError.notFound('Denúncia não encontrada.');
  }

  await recordAuditLog({
    actorUserId: actor.id,
    action: 'admin.resolve_report',
    entityType: 'report',
    entityId: reportId,
    ipAddress: requestMeta.ip,
    userAgent: requestMeta.userAgent,
    metadata: {
      status: payload.status
    }
  });

  return updated;
}

async function listAuditLogs(filters, pagination) {
  const { items, total } = await adminRepository.findAuditLogs(filters, pagination);
  return {
    items,
    pagination: buildPaginationMeta({
      page: pagination.page,
      limit: pagination.limit,
      total
    })
  };
}

async function getGlobalSettings() {
  return adminRepository.findAllGlobalSettings();
}

async function updateGlobalSettings(settingsList, actor, requestMeta = {}) {
  const updated = await adminRepository.upsertGlobalSettings(settingsList, actor.id);

  await recordAuditLog({
    actorUserId: actor.id,
    action: 'admin.update_global_settings',
    entityType: 'global_settings',
    ipAddress: requestMeta.ip,
    userAgent: requestMeta.userAgent,
    metadata: {
      keys: settingsList.map((s) => s.key)
    }
  });

  return updated;
}

module.exports = {
  getDashboardOverview,
  createCompanyAccount,
  listCompanies,
  getCompanyDetails,
  updateCompanyStatus,
  assignCompanyPlan,
  listPlans,
  updatePlan,
  listSubscriptions,
  listPayments,
  listUsers,
  updateUserStatus,
  listDestinationsForModeration,
  moderateDestination,
  listExperiencesForModeration,
  moderateExperience,
  listBookings,
  listReports,
  resolveReport,
  listAuditLogs,
  getGlobalSettings,
  updateGlobalSettings
};