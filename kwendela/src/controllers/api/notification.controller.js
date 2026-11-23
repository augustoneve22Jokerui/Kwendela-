'use strict';

const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/ApiResponse');
const { parsePagination } = require('../../utils/pagination');
const notificationService = require('../../services/notification.service');

const listMyNotifications = asyncHandler(async (req, res) => {
  const pagination = parsePagination(req.query, { defaultLimit: 20 });
  const filters = {
    unreadOnly: req.query.unreadOnly,
    type: req.query.type
  };

  const result = await notificationService.listUserNotifications(req.user.id, filters, pagination);
  return ApiResponse.success(
    res,
    {
      items: result.items,
      unreadCount: result.unreadCount
    },
    'Notificações obtidas com sucesso.',
    200,
    { pagination: result.pagination }
  );
});

const getUnreadCount = asyncHandler(async (req, res) => {
  const unreadCount = await notificationService.countUnread(req.user.id);
  return ApiResponse.success(res, { unreadCount }, 'Contagem de notificações não lidas obtida.');
});

const markAsRead = asyncHandler(async (req, res) => {
  const updated = await notificationService.markAsRead(req.params.id, req.user.id);
  return ApiResponse.success(res, updated, 'Notificação marcada como lida.');
});

const markAllAsRead = asyncHandler(async (req, res) => {
  const result = await notificationService.markAllAsRead(req.user.id);
  return ApiResponse.success(res, result, 'Todas as notificações foram marcadas como lidas.');
});

module.exports = {
  listMyNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead
};