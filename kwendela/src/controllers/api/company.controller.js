'use strict';

const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/ApiResponse');
const { parsePagination } = require('../../utils/pagination');
const { getIo, emitToUser } = require('../../sockets');
const chatService = require('../../services/chat.service');

function extractRequestMeta(req) {
  return {
    ip: req.ip || (req.connection && req.connection.remoteAddress) || null,
    userAgent: req.get('user-agent') || null
  };
}

const listConversations = asyncHandler(async (req, res) => {
  const pagination = parsePagination(req.query, { defaultLimit: 20 });
  const result = await chatService.listUserConversations(req.user, pagination);
  return ApiResponse.paginated(res, result.items, result.pagination, 'Conversas obtidas com sucesso.');
});

const createOrGetConversation = asyncHandler(async (req, res) => {
  const conversation = await chatService.createOrGetConversation(req.body, req.user);
  return ApiResponse.created(res, conversation, 'Conversa iniciada com sucesso.');
});

const getConversationMessages = asyncHandler(async (req, res) => {
  const pagination = parsePagination(req.query, { defaultLimit: 50, maxLimit: 100 });
  const result = await chatService.getConversationMessages(req.params.id, req.user, pagination);
  return ApiResponse.paginated(res, result.items, result.pagination, 'Mensagens obtidas com sucesso.');
});

const sendMessage = asyncHandler(async (req, res) => {
  const attachmentUrl = req.uploadedFile
    ? req.uploadedFile.url
    : req.body.attachmentUrl || null;

  const result = await chatService.sendMessage({
    conversationId: req.params.id,
    sender: req.user,
    content: req.body.content || '',
    messageType: req.body.messageType || (req.uploadedFile ? 'image' : 'text'),
    attachmentUrl,
    metadata: req.body.metadata || {}
  });

  const io = getIo();
  if (io) {
    io.to(`conversation:${req.params.id}`).emit('chat:new_message', result.message);
  }
  if (Array.isArray(result.recipientUserIds)) {
    for (const recipientId of result.recipientUserIds) {
      emitToUser(recipientId, 'chat:conversation_updated', {
        conversationId: req.params.id,
        lastMessage: result.message
      });
    }
  }

  return ApiResponse.created(res, result.message, 'Mensagem enviada com sucesso.');
});

const markAsRead = asyncHandler(async (req, res) => {
  const updated = await chatService.markConversationAsRead(req.params.id, req.user);

  const io = getIo();
  if (io) {
    io.to(`conversation:${req.params.id}`).emit('chat:messages_read', {
      conversationId: req.params.id,
      readerId: req.user.id,
      readAt: updated.readAt
    });
  }

  return ApiResponse.success(res, updated, 'Mensagens marcadas como lidas.');
});

const reportConversation = asyncHandler(async (req, res) => {
  const report = await chatService.reportConversation(
    req.params.id,
    req.body,
    req.user,
    extractRequestMeta(req)
  );
  return ApiResponse.created(res, report, 'Denúncia registada e encaminhada para moderação.');
});

module.exports = {
  listConversations,
  createOrGetConversation,
  getConversationMessages,
  sendMessage,
  markAsRead,
  reportConversation
};