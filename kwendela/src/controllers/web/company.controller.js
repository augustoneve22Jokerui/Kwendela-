'use strict';

const asyncHandler = require('../../utils/asyncHandler');
const { parsePagination } = require('../../utils/pagination');
const companyService = require('../../services/company.service');
const destinationService = require('../../services/destination.service');
const experienceService = require('../../services/experience.service');
const expeditionService = require('../../services/expedition.service');
const bookingService = require('../../services/booking.service');
const routeService = require('../../services/route.service');
const chatService = require('../../services/chat.service');
const notificationService = require('../../services/notification.service');
const planService = require('../../services/plan.service');

const renderDashboard = asyncHandler(async (req, res) => {
  const [dashboard, planUsage] = await Promise.all([
    companyService.getCompanyDashboard(req.company.id),
    planService.getCompanyPlanUsage(req.company.id)
  ]);

  return res.render('pages/company/dashboard', {
    layout: 'layouts/dashboard',
    title: `${req.company.name} — Portal Empresarial KWENDELA`,
    portalRole: 'company',
    activeNav: 'dashboard',
    company: req.company,
    dashboard,
    planUsage
  });
});

const renderProfile = asyncHandler(async (req, res) => {
  const companyProfile = await companyService.getCompanyProfile(req.company.id);
  return res.render('pages/company/profile', {
    layout: 'layouts/dashboard',
    title: 'Perfil da Empresa — Portal Empresarial',
    portalRole: 'company',
    activeNav: 'profile',
    company: companyProfile
  });
});

const renderDestinations = asyncHandler(async (req, res) => {
  const pagination = parsePagination(req.query, { defaultLimit: 20 });
  const filters = {
    moderationStatus: req.query.moderationStatus || '',
    search: req.query.search || ''
  };

  const result = await destinationService.listCompanyDestinations(
    req.company.id,
    filters,
    pagination
  );

  return res.render('pages/company/destinations', {
    layout: 'layouts/dashboard',
    title: 'Destinos da Empresa — Portal Empresarial',
    portalRole: 'company',
    activeNav: 'destinations',
    company: req.company,
    destinations: result.items,
    pagination: result.pagination,
    filters
  });
});

const renderExperiences = asyncHandler(async (req, res) => {
  const pagination = parsePagination(req.query, { defaultLimit: 20 });
  const filters = {
    moderationStatus: req.query.moderationStatus || '',
    experienceType: req.query.experienceType || '',
    search: req.query.search || ''
  };

  const [experiencesResult, publicDestinations, companyDestinations] = await Promise.all([
    experienceService.listCompanyExperiences(req.company.id, filters, pagination),
    destinationService.listPublicDestinations({}, { limit: 100, offset: 0, sortBy: 'name', sortOrder: 'ASC' }),
    destinationService.listCompanyDestinations(req.company.id, {}, { limit: 100, offset: 0 })
  ]);

  const destinationsMap = new Map();
  for (const d of [...companyDestinations.items, ...publicDestinations.items]) {
    destinationsMap.set(d.id, d);
  }

  return res.render('pages/company/experiences', {
    layout: 'layouts/dashboard',
    title: 'Experiências e Passeios — Portal Empresarial',
    portalRole: 'company',
    activeNav: 'experiences',
    company: req.company,
    experiences: experiencesResult.items,
    pagination: experiencesResult.pagination,
    availableDestinations: Array.from(destinationsMap.values()),
    filters
  });
});

const renderExpeditions = asyncHandler(async (req, res) => {
  const pagination = parsePagination(req.query, { defaultLimit: 20 });
  const filters = {
    status: req.query.status || '',
    search: req.query.search || ''
  };

  const [
    expeditionsResult,
    publicDestinations,
    companyDestinations,
    companyExperiences,
    guides,
    transports,
    routesResult
  ] = await Promise.all([
    expeditionService.listCompanyExpeditions(req.company.id, filters, pagination),
    destinationService.listPublicDestinations({}, { limit: 100, offset: 0, sortBy: 'name', sortOrder: 'ASC' }),
    destinationService.listCompanyDestinations(req.company.id, {}, { limit: 100, offset: 0 }),
    experienceService.listCompanyExperiences(req.company.id, {}, { limit: 100, offset: 0 }),
    companyService.listGuides(req.company.id),
    companyService.listTransports(req.company.id),
    routeService.listRoutes({ filterCompanyId: req.company.id }, { limit: 100, offset: 0 }, req.user)
  ]);

  const destinationsMap = new Map();
  for (const d of [...companyDestinations.items, ...publicDestinations.items]) {
    destinationsMap.set(d.id, d);
  }

  return res.render('pages/company/expeditions', {
    layout: 'layouts/dashboard',
    title: 'Expedições — Portal Empresarial',
    portalRole: 'company',
    activeNav: 'expeditions',
    company: req.company,
    expeditions: expeditionsResult.items,
    pagination: expeditionsResult.pagination,
    availableDestinations: Array.from(destinationsMap.values()),
    availableExperiences: companyExperiences.items,
    guides,
    transports,
    routes: routesResult.items,
    filters
  });
});

const renderBookings = asyncHandler(async (req, res) => {
  const pagination = parsePagination(req.query, { defaultLimit: 20 });
  const filters = {
    status: req.query.status || '',
    expeditionId: req.query.expeditionId || '',
    search: req.query.search || ''
  };

  const result = await bookingService.listCompanyBookings(req.company.id, filters, pagination);

  return res.render('pages/company/bookings', {
    layout: 'layouts/dashboard',
    title: 'Reservas — Portal Empresarial',
    portalRole: 'company',
    activeNav: 'bookings',
    company: req.company,
    bookings: result.items,
    pagination: result.pagination,
    filters
  });
});

const renderGuidesTransports = asyncHandler(async (req, res) => {
  const [guides, transports] = await Promise.all([
    companyService.listGuides(req.company.id),
    companyService.listTransports(req.company.id)
  ]);

  return res.render('pages/company/guides-transports', {
    layout: 'layouts/dashboard',
    title: 'Guias e Transportes — Portal Empresarial',
    portalRole: 'company',
    activeNav: 'logistics',
    company: req.company,
    guides,
    transports
  });
});

const renderRoutes = asyncHandler(async (req, res) => {
  const pagination = parsePagination(req.query, { defaultLimit: 20 });
  const [routesResult, publicDestinations] = await Promise.all([
    routeService.listRoutes({ filterCompanyId: req.company.id }, pagination, req.user),
    destinationService.listPublicDestinations({}, { limit: 100, offset: 0, sortBy: 'name', sortOrder: 'ASC' })
  ]);

  return res.render('pages/company/routes', {
    layout: 'layouts/dashboard',
    title: 'Rotas e Itinerários — Portal Empresarial',
    portalRole: 'company',
    activeNav: 'routes',
    company: req.company,
    routes: routesResult.items,
    pagination: routesResult.pagination,
    destinations: publicDestinations.items
  });
});

const renderChat = asyncHandler(async (req, res) => {
  const pagination = parsePagination(req.query, { defaultLimit: 30 });
  const conversationsResult = await chatService.listUserConversations(req.user, pagination);

  return res.render('pages/company/chat', {
    layout: 'layouts/dashboard',
    title: 'Mensagens — Portal Empresarial',
    portalRole: 'company',
    activeNav: 'chat',
    company: req.company,
    conversations: conversationsResult.items,
    selectedConversationId: req.query.conversationId || null
  });
});

const renderNotifications = asyncHandler(async (req, res) => {
  const pagination = parsePagination(req.query, { defaultLimit: 20 });
  const result = await notificationService.listUserNotifications(req.user.id, {}, pagination);

  return res.render('pages/company/notifications', {
    layout: 'layouts/dashboard',
    title: 'Notificações — Portal Empresarial',
    portalRole: 'company',
    activeNav: 'notifications',
    company: req.company,
    notifications: result.items,
    unreadCount: result.unreadCount,
    pagination: result.pagination
  });
});

const renderFinance = asyncHandler(async (req, res) => {
  const pagination = parsePagination(req.query, { defaultLimit: 20 });
  const finance = await companyService.getCompanyFinanceSummary(req.company.id, pagination);

  return res.render('pages/company/finance', {
    layout: 'layouts/dashboard',
    title: 'Gestão Financeira — Portal Empresarial',
    portalRole: 'company',
    activeNav: 'finance',
    company: req.company,
    wallet: finance.wallet,
    transactions: finance.transactions,
    pagination: finance.pagination
  });
});

const renderReports = asyncHandler(async (req, res) => {
  const filters = {
    startDate: req.query.startDate || '',
    endDate: req.query.endDate || ''
  };
  const reports = await companyService.getCompanyReports(req.company.id, filters);

  return res.render('pages/company/reports', {
    layout: 'layouts/dashboard',
    title: 'Relatórios — Portal Empresarial',
    portalRole: 'company',
    activeNav: 'reports',
    company: req.company,
    reports,
    filters
  });
});

const renderTeam = asyncHandler(async (req, res) => {
  const [members, planUsage] = await Promise.all([
    companyService.listTeamMembers(req.company.id),
    planService.getCompanyPlanUsage(req.company.id)
  ]);

  return res.render('pages/company/team', {
    layout: 'layouts/dashboard',
    title: 'Gestão de Equipa — Portal Empresarial',
    portalRole: 'company',
    activeNav: 'team',
    company: req.company,
    members,
    planUsage
  });
});

const renderSubscription = asyncHandler(async (req, res) => {
  const [subscriptionData, planUsage] = await Promise.all([
    companyService.getCompanySubscription(req.company.id),
    planService.getCompanyPlanUsage(req.company.id)
  ]);

  return res.render('pages/company/subscription', {
    layout: 'layouts/dashboard',
    title: 'Assinatura e Planos — Portal Empresarial',
    portalRole: 'company',
    activeNav: 'subscription',
    company: req.company,
    subscriptionData,
    planUsage
  });
});

module.exports = {
  renderDashboard,
  renderProfile,
  renderDestinations,
  renderExperiences,
  renderExpeditions,
  renderBookings,
  renderGuidesTransports,
  renderRoutes,
  renderChat,
  renderNotifications,
  renderFinance,
  renderReports,
  renderTeam,
  renderSubscription
};