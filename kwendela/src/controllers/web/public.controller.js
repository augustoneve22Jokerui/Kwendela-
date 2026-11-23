'use strict';

const asyncHandler = require('../../utils/asyncHandler');
const { parsePagination } = require('../../utils/pagination');
const ApiError = require('../../utils/ApiError');
const destinationService = require('../../services/destination.service');
const experienceService = require('../../services/experience.service');
const expeditionService = require('../../services/expedition.service');
const reviewService = require('../../services/review.service');
const routeService = require('../../services/route.service');
const planService = require('../../services/plan.service');
const walletService = require('../../services/wallet.service');

const renderHome = asyncHandler(async (_req, res) => {
  const [destinationsResult, experiencesResult, expeditionsResult, provinces, plans] =
    await Promise.all([
      destinationService.listPublicDestinations(
        {},
        { page: 1, limit: 6, offset: 0, sortBy: 'rating_avg', sortOrder: 'DESC' }
      ),
      experienceService.listPublicExperiences(
        {},
        { page: 1, limit: 6, offset: 0, sortBy: 'rating_avg', sortOrder: 'DESC' }
      ),
      expeditionService.listPublicExpeditions(
        { hasAvailability: true },
        { page: 1, limit: 4, offset: 0, sortBy: 'start_date', sortOrder: 'ASC' }
      ),
      destinationService.listProvinces(),
      planService.listAvailablePlans()
    ]);

  return res.render('pages/public/home', {
    layout: 'layouts/public',
    title: 'KWENDELA — Descubra o Turismo em Angola com Sofisticação',
    destinations: destinationsResult.items,
    experiences: experiencesResult.items,
    expeditions: expeditionsResult.items,
    provinces,
    plans
  });
});

const renderDiscover = asyncHandler(async (req, res) => {
  const search = req.query.search || '';
  const province = req.query.province || '';
  const category = req.query.category || '';

  const [destinationsResult, experiencesResult, expeditionsResult, routesResult, provinces] =
    await Promise.all([
      destinationService.listPublicDestinations(
        { search, province, category },
        { page: 1, limit: 6, offset: 0, sortBy: 'rating_avg', sortOrder: 'DESC' }
      ),
      experienceService.listPublicExperiences(
        { search, province, category },
        { page: 1, limit: 6, offset: 0, sortBy: 'created_at', sortOrder: 'DESC' }
      ),
      expeditionService.listPublicExpeditions(
        { search },
        { page: 1, limit: 6, offset: 0, sortBy: 'start_date', sortOrder: 'ASC' }
      ),
      routeService.listRoutes(
        { onlyPublic: true, search },
        { page: 1, limit: 4, offset: 0 },
        req.user || null
      ),
      destinationService.listProvinces()
    ]);

  return res.render('pages/public/discover', {
    layout: 'layouts/public',
    title: 'Descobrir Angola — KWENDELA',
    destinations: destinationsResult.items,
    experiences: experiencesResult.items,
    expeditions: expeditionsResult.items,
    routes: routesResult.items,
    provinces,
    filters: { search, province, category }
  });
});

const renderDestinations = asyncHandler(async (req, res) => {
  const pagination = parsePagination(req.query, {
    defaultLimit: 12,
    allowedSortColumns: ['created_at', 'name', 'rating_avg', 'views_count'],
    defaultSortBy: 'created_at',
    defaultSortOrder: 'DESC'
  });

  const filters = {
    search: req.query.search || '',
    province: req.query.province || '',
    category: req.query.category || ''
  };

  const [result, provinces] = await Promise.all([
    destinationService.listPublicDestinations(filters, pagination),
    destinationService.listProvinces()
  ]);

  return res.render('pages/public/destinations', {
    layout: 'layouts/public',
    title: 'Destinos Turísticos — KWENDELA',
    destinations: result.items,
    pagination: result.pagination,
    provinces,
    filters
  });
});

const renderDestinationDetail = asyncHandler(async (req, res) => {
  const destination = await destinationService.getPublicDestinationByIdOrSlug(
    req.params.idOrSlug,
    req.user || null
  );

  const [experiencesResult, reviewsResult] = await Promise.all([
    experienceService.listPublicExperiences(
      { destinationId: destination.id },
      { page: 1, limit: 6, offset: 0, sortBy: 'rating_avg', sortOrder: 'DESC' }
    ),
    reviewService.listReviews(
      { targetType: 'destination', targetId: destination.id },
      { page: 1, limit: 10, offset: 0 }
    )
  ]);

  return res.render('pages/public/destination-detail', {
    layout: 'layouts/public',
    title: `${destination.name} — Destinos KWENDELA`,
    destination,
    experiences: experiencesResult.items,
    reviews: reviewsResult.items
  });
});

const renderExperiences = asyncHandler(async (req, res) => {
  const pagination = parsePagination(req.query, {
    defaultLimit: 12,
    allowedSortColumns: ['created_at', 'price_kz', 'rating_avg', 'duration_hours', 'title'],
    defaultSortBy: 'created_at',
    defaultSortOrder: 'DESC'
  });

  const filters = {
    search: req.query.search || '',
    province: req.query.province || '',
    category: req.query.category || '',
    experienceType: req.query.experienceType || '',
    minPrice: req.query.minPrice || '',
    maxPrice: req.query.maxPrice || ''
  };

  const [result, provinces] = await Promise.all([
    experienceService.listPublicExperiences(filters, pagination),
    destinationService.listProvinces()
  ]);

  return res.render('pages/public/experiences', {
    layout: 'layouts/public',
    title: 'Experiências e Passeios — KWENDELA',
    experiences: result.items,
    pagination: result.pagination,
    provinces,
    filters
  });
});

const renderExperienceDetail = asyncHandler(async (req, res) => {
  const experience = await experienceService.getPublicExperienceByIdOrSlug(req.params.idOrSlug);

  const reviewsResult = await reviewService.listReviews(
    { targetType: 'experience', targetId: experience.id },
    { page: 1, limit: 10, offset: 0 }
  );

  return res.render('pages/public/experience-detail', {
    layout: 'layouts/public',
    title: `${experience.title} — Experiências KWENDELA`,
    experience,
    reviews: reviewsResult.items
  });
});

const renderExpeditions = asyncHandler(async (req, res) => {
  const pagination = parsePagination(req.query, {
    defaultLimit: 12,
    allowedSortColumns: ['start_date', 'price_per_participant', 'created_at'],
    defaultSortBy: 'start_date',
    defaultSortOrder: 'ASC'
  });

  const filters = {
    search: req.query.search || '',
    hasAvailability: req.query.hasAvailability || '',
    startDateFrom: req.query.startDateFrom || '',
    maxPrice: req.query.maxPrice || ''
  };

  const result = await expeditionService.listPublicExpeditions(filters, pagination);

  return res.render('pages/public/expeditions', {
    layout: 'layouts/public',
    title: 'Expedições — KWENDELA',
    expeditions: result.items,
    pagination: result.pagination,
    filters
  });
});

const renderExpeditionDetail = asyncHandler(async (req, res) => {
  const expedition = await expeditionService.getPublicExpeditionByIdOrSlug(
    req.params.idOrSlug,
    req.user || null
  );

  return res.render('pages/public/expedition-detail', {
    layout: 'layouts/public',
    title: `${expedition.title} — Expedições KWENDELA`,
    expedition
  });
});

const renderBookingCheckout = asyncHandler(async (req, res) => {
  const { expeditionId, experienceId } = req.query;

  if (!expeditionId && !experienceId) {
    throw ApiError.badRequest('Selecione uma experiência ou expedição para reservar.');
  }

  let bookingItem = null;
  let itemType = null;

  if (expeditionId) {
    bookingItem = await expeditionService.getPublicExpeditionByIdOrSlug(
      expeditionId,
      req.user || null
    );
    itemType = 'expedition';
  } else {
    bookingItem = await experienceService.getPublicExperienceByIdOrSlug(experienceId);
    itemType = 'experience';
  }

  let walletSummary = null;
  if (req.user) {
    walletSummary = await walletService.getMyWalletSummary(req.user);
  }

  return res.render('pages/public/booking-checkout', {
    layout: 'layouts/public',
    title: 'Finalizar Reserva — KWENDELA',
    itemType,
    bookingItem,
    walletSummary
  });
});

module.exports = {
  renderHome,
  renderDiscover,
  renderDestinations,
  renderDestinationDetail,
  renderExperiences,
  renderExperienceDetail,
  renderExpeditions,
  renderExpeditionDetail,
  renderBookingCheckout
};