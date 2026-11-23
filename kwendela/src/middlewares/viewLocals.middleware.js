'use strict';

const env = require('../config/env');
const notificationRepository = require('../repositories/notification.repository');

function formatKz(amount) {
  const num = Number(amount || 0);
  if (!Number.isFinite(num)) {
    return '0,00 Kz';
  }
  return `${num.toLocaleString('pt-PT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })} Kz`;
}

function formatDate(value) {
  if (!value) {
    return '—';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return date.toLocaleDateString('pt-PT', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

function formatDateTime(value) {
  if (!value) {
    return '—';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return date.toLocaleString('pt-PT', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function readAndClearFlashCookie(req, res) {
  const raw = req.cookies && req.cookies.kwendela_flash;
  if (!raw) {
    return {
      success: req.query && req.query.success ? String(req.query.success) : null,
      error: req.query && req.query.error ? String(req.query.error) : null,
      info: req.query && req.query.info ? String(req.query.info) : null
    };
  }

  res.clearCookie('kwendela_flash', { path: '/' });
  try {
    const parsed = JSON.parse(raw);
    return {
      success: parsed.success || null,
      error: parsed.error || null,
      info: parsed.info || null
    };
  } catch (_err) {
    return { success: null, error: null, info: null };
  }
}

async function viewLocals(req, res, next) {
  res.locals.appName = env.appName;
  res.locals.appUrl = env.appUrl;
  res.locals.currentPath = req.path;
  res.locals.currentUrl = req.originalUrl;
  res.locals.currentUser = req.user || null;
  res.locals.theme = req.cookies && req.cookies.kwendela_theme === 'dark' ? 'dark' : 'light';
  res.locals.flash = readAndClearFlashCookie(req, res);
  res.locals.mapsConfig = {
    provider: env.maps.provider,
    mapboxToken: env.maps.mapboxToken,
    googleApiKey: env.maps.googleApiKey
  };
  res.locals.helpers = {
    formatKz,
    formatDate,
    formatDateTime
  };
  res.locals.unreadNotificationsCount = 0;

  if (req.user && req.method === 'GET' && !req.originalUrl.startsWith('/api/')) {
    try {
      res.locals.unreadNotificationsCount = await notificationRepository.countUnread(req.user.id);
    } catch (_err) {
      res.locals.unreadNotificationsCount = 0;
    }
  }

  next();
}

module.exports = {
  viewLocals,
  formatKz,
  formatDate,
  formatDateTime
};