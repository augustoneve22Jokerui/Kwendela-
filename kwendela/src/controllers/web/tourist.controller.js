'use strict';

const asyncHandler = require('../../utils/asyncHandler');
const { parsePagination } = require('../../utils/pagination');
const userService = require('../../services/user.service');
const walletService = require('../../services/wallet.service');
const notificationService = require('../../services/notification.service');
const chatService = require('../../services/chat.service');
const reviewService = require('../../services/review.service');
const bookingService = require('../../services/booking.service');
const routeService = require('../../services/route.service');
const trackingService = require('../../services/tracking.service');

const renderProfile = asyncHandler(async (req, res) => {
  const profile = await userService.getMyProfile(req.user.id);
  return res.render('pages/tourist/profile', {
    layout: 'layouts/dashboard',
    title: 'Meu Perfil — KWENDELA',
    portalRole: 'tourist',
    activeNav: 'profile',
    profile
  });
});

const renderTrips = asyncHandler(async (req, res) => {
  const [tripsSummary, routesResult] = await Promise.all([
    userService.getMyTripsSummary(req.user.id),
    routeService.listRoutes({}, { page: 1, limit: 20, offset: 0 }, req.user)
  ]);

  return res.render('pages/tourist/trips', {
    layout: 'layouts/dashboard',
    title: 'Minhas Viagens e Rotas — KWENDELA',
    portalRole: 'tourist',
    activeNav: 'trips',
    tripsSummary,
    routes: routesResult.items
  });
});

const renderFavorites = asyncHandler(async (req, res) => {
  const pagination = parsePagination(req.query, { defaultLimit: 12 });
  const result = await userService.listMyFavorites(req.user.id, pagination);

  return res.render('pages/tourist/favorites', {
    layout: 'layouts/dashboard',
    title: 'Destinos Favoritos — KWENDELA',
    portalRole: 'tourist',
    activeNav: 'favorites',
    favorites: result.items,
    pagination: result.pagination
  });
});

const renderWallet = asyncHandler(async (req, res) => {
  const pagination = parsePagination(req.query, { defaultLimit: 20 });
  const [walletSummary, transactionsResult] = await Promise.all([
    walletService.getMyWalletSummary(req.user),
    walletService.listMyTransactions(req.user.id, {}, pagination)
  ]);

  return res.render('pages/tourist/wallet', {
    layout: 'layouts/dashboard',
    title: 'Carteira KWENDELA',
    portalRole: 'tourist',
    activeNav: 'wallet',
    walletSummary,
    transactions: transactionsResult.items,
    pagination: transactionsResult.pagination
  });
});

const renderPremium = asyncHandler(async (req, res) => {
  const [profile, walletSummary] = await Promise.all([
    userService.getMyProfile(req.user.id),
    walletService.getMyWalletSummary(req.user)
  ]);

  return res.render('pages/tourist/premium', {
    layout: 'layouts/dashboard',
    title: 'KWENDELA Premium',
    portalRole: 'tourist',
    activeNav: 'premium',
    profile,
    walletSummary,
    pricing: walletService.PREMIUM_PRICING_KZ
  });
});

const renderNotifications = asyncHandler(async (req, res) => {
  const pagination = parsePagination(req.query, { defaultLimit: 20 });
  const result = await notificationService.listUserNotifications(req.user.id, {}, pagination);

  return res.render('pages/tourist/notifications', {
    layout: 'layouts/dashboard',
    title: 'Notificações — KWENDELA',
    portalRole: 'tourist',
    activeNav: 'notifications',
    notifications: result.items,
    unreadCount: result.unreadCount,
    pagination: result.pagination
  });
});

const renderChat = asyncHandler(async (req, res) => {
  const pagination = parsePagination(req.query, { defaultLimit: 30 });
  const conversationsResult = await chatService.listUserConversations(req.user, pagination);

  return res.render('pages/tourist/chat', {
    layout: 'layouts/dashboard',
    title: 'Conversas — KWENDELA',
    portalRole: 'tourist',
    activeNav: 'chat',
    conversations: conversationsResult.items,
    selectedConversationId: req.query.conversationId || null
  });
});

const renderReviews = asyncHandler(async (req, res) => {
  const pagination = parsePagination(req.query, { defaultLimit: 12 });
  const [reviewsResult, bookingsResult] = await Promise.all([
    reviewService.listUserReviews(req.user.id, pagination),
    bookingService.listTouristBookings(req.user.id, {}, { page: 1, limit: 30, offset: 0 })
  ]);

  return res.render('pages/tourist/reviews', {
    layout: 'layouts/dashboard',
    title: 'Minhas Avaliações — KWENDELA',
    portalRole: 'tourist',
    activeNav: 'reviews',
    reviews: reviewsResult.items,
    pagination: reviewsResult.pagination,
    bookings: bookingsResult.items
  });
});

const renderTracking = asyncHandler(async (req, res) => {
  const tripsSummary = await userService.getMyTripsSummary(req.user.id);
  const expeditionBookings = [...tripsSummary.upcoming, ...tripsSummary.past].filter(
    (b) => b.expedition_id && ['confirmed', 'checked_in', 'completed'].includes(b.status)
  );

  const selectedExpeditionId =
    req.query.expeditionId ||
    (expeditionBookings[0] ? expeditionBookings[0].expedition_id : null);

  let trackingData = null;
  if (selectedExpeditionId) {
    try {
      trackingData = await trackingService.getExpeditionTrackingHistory(
        selectedExpeditionId,
        req.user,
        { limit: 100 }
      );
    } catch (_err) {
      trackingData = null;
    }
  }

  return res.render('pages/tourist/tracking', {
    layout: 'layouts/dashboard',
    title: 'Acompanhamento de Viagem — KWENDELA',
    portalRole: 'tourist',
    activeNav: 'tracking',
    expeditionBookings,
    selectedExpeditionId,
    trackingData
  });
});

module.exports = {
  renderProfile,
  renderTrips,
  renderFavorites,
  renderWallet,
  renderPremium,
  renderNotifications,
  renderChat,
  renderReviews,
  renderTracking
};