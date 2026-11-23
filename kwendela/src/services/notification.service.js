'use strict';

const logger = require('../config/logger');
const ApiError = require('../utils/ApiError');
const { buildPaginationMeta } = require('../utils/pagination');
const { emitToUser } = require('../sockets');
const notificationRepository = require('../repositories/notification.repository');
const companyRepository = require('../repositories/company.repository');

async function createNotification(
  {
    userId,
    type,
    title,
    message,
    referenceType = null,
    referenceId = null,
    metadata = {}
  },
  client = null
) {
  if (!userId) {
    return null;
  }

  try {
    const notification = await notificationRepository.create(
      {
        userId,
        type,
        title,
        message,
        referenceType,
        referenceId,
        metadata
      },
      client
    );

    if (!client) {
      emitToUser(userId, 'notification:new', notification);
    }

    return notification;
  } catch (err) {
    logger.warn('Falha ao criar notificação', {
      userId,
      type,
      reason: err.message
    });
    return null;
  }
}

async function notifyCompanyAdmins(companyId, payload) {
  try {
    const adminUserIds = await companyRepository.findAdminUserIds(companyId);
    const results = [];

    for (const userId of adminUserIds) {
      const created = await createNotification({
        userId,
        ...payload
      });
      if (created) {
        results.push(created);
      }
    }

    return results;
  } catch (err) {
    logger.warn('Falha ao notificar administradores da empresa', {
      companyId,
      reason: err.message
    });
    return [];
  }
}

async function listUserNotifications(userId, filters, pagination) {
  const { items, total } = await notificationRepository.findByUser(userId, filters, pagination);
  const unreadCount = await notificationRepository.countUnread(userId);

  return {
    items,
    unreadCount,
    pagination: buildPaginationMeta({
      page: pagination.page,
      limit: pagination.limit,
      total
    })
  };
}

async function countUnread(userId) {
  return notificationRepository.countUnread(userId);
}

async function markAsRead(notificationId, userId) {
  const updated = await notificationRepository.markAsRead(notificationId, userId);
  if (!updated) {
    throw ApiError.notFound('Notificação não encontrada.');
  }
  return updated;
}

async function markAllAsRead(userId) {
  const updatedCount = await notificationRepository.markAllAsRead(userId);
  return { updatedCount };
}

module.exports = {
  createNotification,
  notifyCompanyAdmins,
  listUserNotifications,
  countUnread,
  markAsRead,
  markAllAsRead
};