'use strict';

const asyncHandler = require('../../utils/asyncHandler');
const { parsePagination } = require('../../utils/pagination');
const adminService = require('../../services/admin.service');

const renderDashboard = asyncHandler(async (_req, res) => {
  const overview = await adminService.getDashboardOverview();
  return res.render('pages/admin/dashboard', {
    layout: 'layouts/dashboard',
    title: 'Administração Suprema — KWENDELA',
    portalRole: 'admin',
    activeNav: 'dashboard',
    overview
  });
});

const renderCompanies = asyncHandler(async (req, res) => {
  const pagination = parsePagination(req.query, { defaultLimit: 20 });
  const filters = {
    status: req.query.status || '',
    province: req.query.province || '',
    search: req.query.search || ''
  };

  const [companiesResult, plans] = await Promise.all([
    adminService.listCompanies(filters, pagination),
    adminService.listPlans()
  ]);

  return res.render('pages/admin/companies', {
    layout: 'layouts/dashboard',
    title: 'Gestão de Empresas — Administração KWENDELA',
    portalRole: 'admin',
    activeNav: 'companies',
    companies: companiesResult.items,
    pagination: companiesResult.pagination,
    plans,
    filters
  });
});

const renderPlans = asyncHandler(async (_req, res) => {
  const plans = await adminService.listPlans();
  return res.render('pages/admin/plans', {
    layout: 'layouts/dashboard',
    title: 'Planos Empresariais — Administração KWENDELA',
    portalRole: 'admin',
    activeNav: 'plans',
    plans
  });
});

const renderSubscriptions = asyncHandler(async (req, res) => {
  const pagination = parsePagination(req.query, { defaultLimit: 20 });
  const filters = {
    status: req.query.status || '',
    planId: req.query.planId || ''
  };

  const [subscriptionsResult, plans] = await Promise.all([
    adminService.listSubscriptions(filters, pagination),
    adminService.listPlans()
  ]);

  return res.render('pages/admin/subscriptions', {
    layout: 'layouts/dashboard',
    title: 'Assinaturas — Administração KWENDELA',
    portalRole: 'admin',
    activeNav: 'subscriptions',
    subscriptions: subscriptionsResult.items,
    pagination: subscriptionsResult.pagination,
    plans,
    filters
  });
});

const renderPayments = asyncHandler(async (req, res) => {
  const pagination = parsePagination(req.query, { defaultLimit: 20 });
  const filters = {
    type: req.query.type || '',
    status: req.query.status || '',
    search: req.query.search || ''
  };

  const paymentsResult = await adminService.listPayments(filters, pagination);

  return res.render('pages/admin/payments', {
    layout: 'layouts/dashboard',
    title: 'Operações Financeiras — Administração KWENDELA',
    portalRole: 'admin',
    activeNav: 'payments',
    payments: paymentsResult.items,
    pagination: paymentsResult.pagination,
    filters
  });
});

const renderUsers = asyncHandler(async (req, res) => {
  const pagination = parsePagination(req.query, { defaultLimit: 20 });
  const filters = {
    role: req.query.role || '',
    status: req.query.status || '',
    search: req.query.search || ''
  };

  const usersResult = await adminService.listUsers(filters, pagination);

  return res.render('pages/admin/users', {
    layout: 'layouts/dashboard',
    title: 'Utilizadores — Administração KWENDELA',
    portalRole: 'admin',
    activeNav: 'users',
    users: usersResult.items,
    pagination: usersResult.pagination,
    filters
  });
});

const renderDestinationsModeration = asyncHandler(async (req, res) => {
  const pagination = parsePagination(req.query, { defaultLimit: 20 });
  const filters = {
    moderationStatus: req.query.moderationStatus || '',
    search: req.query.search || ''
  };

  const result = await adminService.listDestinationsForModeration(filters, pagination);

  return res.render('pages/admin/destinations-moderation', {
    layout: 'layouts/dashboard',
    title: 'Moderação de Destinos — Administração KWENDELA',
    portalRole: 'admin',
    activeNav: 'destinations',
    destinations: result.items,
    pagination: result.pagination,
    filters
  });
});

const renderExperiencesModeration = asyncHandler(async (req, res) => {
  const pagination = parsePagination(req.query, { defaultLimit: 20 });
  const filters = {
    moderationStatus: req.query.moderationStatus || '',
    search: req.query.search || ''
  };

  const result = await adminService.listExperiencesForModeration(filters, pagination);

  return res.render('pages/admin/experiences-moderation', {
    layout: 'layouts/dashboard',
    title: 'Moderação de Experiências — Administração KWENDELA',
    portalRole: 'admin',
    activeNav: 'experiences',
    experiences: result.items,
    pagination: result.pagination,
    filters
  });
});

const renderBookings = asyncHandler(async (req, res) => {
  const pagination = parsePagination(req.query, { defaultLimit: 20 });
  const filters = {
    status: req.query.status || '',
    search: req.query.search || ''
  };

  const result = await adminService.listBookings(filters, pagination);

  return res.render('pages/admin/bookings', {
    layout: 'layouts/dashboard',
    title: 'Reservas Globais — Administração KWENDELA',
    portalRole: 'admin',
    activeNav: 'bookings',
    bookings: result.items,
    pagination: result.pagination,
    filters
  });
});

const renderReports = asyncHandler(async (req, res) => {
  const pagination = parsePagination(req.query, { defaultLimit: 20 });
  const filters = {
    status: req.query.status || '',
    targetType: req.query.targetType || ''
  };

  const result = await adminService.listReports(filters, pagination);

  return res.render('pages/admin/reports', {
    layout: 'layouts/dashboard',
    title: 'Denúncias — Administração KWENDELA',
    portalRole: 'admin',
    activeNav: 'reports',
    reports: result.items,
    pagination: result.pagination,
    filters
  });
});

const renderAudit = asyncHandler(async (req, res) => {
  const pagination = parsePagination(req.query, { defaultLimit: 30 });
  const filters = {
    action: req.query.action || '',
    entityType: req.query.entityType || ''
  };

  const result = await adminService.listAuditLogs(filters, pagination);

  return res.render('pages/admin/audit', {
    layout: 'layouts/dashboard',
    title: 'Auditoria — Administração KWENDELA',
    portalRole: 'admin',
    activeNav: 'audit',
    logs: result.items,
    pagination: result.pagination,
    filters
  });
});

const renderSettings = asyncHandler(async (_req, res) => {
  const settings = await adminService.getGlobalSettings();
  return res.render('pages/admin/settings', {
    layout: 'layouts/dashboard',
    title: 'Configurações Globais — Administração KWENDELA',
    portalRole: 'admin',
    activeNav: 'settings',
    settings
  });
});

module.exports = {
  renderDashboard,
  renderCompanies,
  renderPlans,
  renderSubscriptions,
  renderPayments,
  renderUsers,
  renderDestinationsModeration,
  renderExperiencesModeration,
  renderBookings,
  renderReports,
  renderAudit,
  renderSettings
};