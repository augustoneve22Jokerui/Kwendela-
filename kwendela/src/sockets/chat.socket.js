'use strict';

const logger = require('../config/logger');
const chatService = require('../services/chat.service');

function registerChatSocket(io, socket) {
  const user = socket.user;

  socket.on('chat:join', async (payload = {}, callback) => {
    try {
      const { conversationId } = payload;
      if (!conversationId) {
        if (typeof callback === 'function') {
          return callback({ ok: false, error: 'conversationId é obrigatório.' });
        }
        return;
      }

      await chatService.assertConversationAccess(conversationId, user);

      const roomName = `conversation:${conversationId}`;
      await socket.join(roomName);

      if (typeof callback === 'function') {
        callback({ ok: true, room: roomName });
      }
    } catch (err) {
      logger.warn('Falha ao entrar na sala de chat', {
        userId: user.id,
        conversationId: payload.conversationId,
        reason: err.message
      });
      if (typeof callback === 'function') {
        callback({ ok: false, error: err.message || 'Acesso negado à conversa.' });
      }
    }
  });

  socket.on('chat:leave', async (payload = {}, callback) => {
    try {
      const { conversationId } = payload;
      if (conversationId) {
        await socket.leave(`conversation:${conversationId}`);
      }
      if (typeof callback === 'function') {
        callback({ ok: true });
      }
    } catch (err) {
      if (typeof callback === 'function') {
        callback({ ok: false, error: err.message });
      }
    }
  });

  socket.on('chat:send_message', async (payload = {}, callback) => {
    try {
      const { conversationId, content, messageType = 'text', attachmentUrl = null } = payload;

      if (!conversationId || (!content && !attachmentUrl)) {
        if (typeof callback === 'function') {
          return callback({
            ok: false,
            error: 'conversationId e conteúdo ou anexo são obrigatórios.'
          });
        }
        return;
      }

      const result = await chatService.sendMessage({
        conversationId,
        sender: user,
        content,
        messageType,
        attachmentUrl
      });

      const roomName = `conversation:${conversationId}`;
      io.to(roomName).emit('chat:new_message', result.message);

      if (Array.isArray(result.recipientUserIds)) {
        for (const recipientId of result.recipientUserIds) {
          io.to(`user:${recipientId}`).emit('chat:conversation_updated', {
            conversationId,
            lastMessage: result.message
          });
        }
      }

      if (typeof callback === 'function') {
        callback({ ok: true, data: result.message });
      }
    } catch (err) {
      logger.warn('Erro ao enviar mensagem via WebSocket', {
        userId: user.id,
        conversationId: payload.conversationId,
        reason: err.message
      });
      if (typeof callback === 'function') {
        callback({ ok: false, error: err.message || 'Não foi possível enviar a mensagem.' });
      }
    }
  });

  socket.on('chat:typing', (payload = {}) => {
    const { conversationId, isTyping } = payload;
    if (!conversationId) {
      return;
    }

    const roomName = `conversation:${conversationId}`;
    if (!socket.rooms.has(roomName)) {
      return;
    }

    socket.to(roomName).emit('chat:user_typing', {
      conversationId,
      userId: user.id,
      userName: user.name,
      isTyping: Boolean(isTyping)
    });
  });

  socket.on('chat:mark_read', async (payload = {}, callback) => {
    try {
      const { conversationId } = payload;
      if (!conversationId) {
        if (typeof callback === 'function') {
          return callback({ ok: false, error: 'conversationId é obrigatório.' });
        }
        return;
      }

      const updated = await chatService.markConversationAsRead(conversationId, user);
      const roomName = `conversation:${conversationId}`;

      io.to(roomName).emit('chat:messages_read', {
        conversationId,
        readerId: user.id,
        readAt: updated.readAt
      });

      if (typeof callback === 'function') {
        callback({ ok: true, data: updated });
      }
    } catch (err) {
      if (typeof callback === 'function') {
        callback({ ok: false, error: err.message });
      }
    }
  });
}

module.exports = registerChatSocket;