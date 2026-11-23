'use strict';

const { Server } = require('socket.io');
const env = require('../config/env');
const logger = require('../config/logger');
const { verifyAccessToken } = require('../utils/token');
const userRepository = require('../repositories/user.repository');
const registerChatSocket = require('./chat.socket');
const registerTrackingSocket = require('./tracking.socket');

let ioInstance = null;

function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader || typeof cookieHeader !== 'string') {
    return cookies;
  }

  const pairs = cookieHeader.split(';');
  for (const pair of pairs) {
    const idx = pair.indexOf('=');
    if (idx > 0) {
      const key = pair.slice(0, idx).trim();
      const val = pair.slice(idx + 1).trim();
      try {
        cookies[key] = decodeURIComponent(val);
      } catch (_err) {
        cookies[key] = val;
      }
    }
  }
  return cookies;
}

function extractSocketToken(socket) {
  if (socket.handshake.auth && socket.handshake.auth.token) {
    return String(socket.handshake.auth.token).replace(/^Bearer\s+/i, '').trim();
  }

  const authHeader = socket.handshake.headers && socket.handshake.headers.authorization;
  if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }

  const cookieHeader = socket.handshake.headers && socket.handshake.headers.cookie;
  const cookies = parseCookies(cookieHeader);
  if (cookies.kwendela_access_token) {
    return cookies.kwendela_access_token;
  }

  return null;
}

function initSockets(httpServer) {
  ioInstance = new Server(httpServer, {
    cors: {
      origin: env.cors.origins,
      methods: ['GET', 'POST'],
      credentials: true
    },
    pingTimeout: 30000,
    pingInterval: 25000
  });

  ioInstance.use(async (socket, next) => {
    try {
      const token = extractSocketToken(socket);
      if (!token) {
        return next(new Error('Autenticação WebSocket obrigatória.'));
      }

      const decoded = verifyAccessToken(token);
      const user = await userRepository.findAuthContextById(decoded.sub);

      if (!user || user.status !== 'active') {
        return next(new Error('Utilizador inativo ou não encontrado.'));
      }

      socket.user = {
        id: user.id,
        name: user.full_name,
        email: user.email,
        role: user.role,
        companyId: user.company_id || null,
        companyRole: user.company_role || null
      };

      return next();
    } catch (err) {
      logger.warn('Ligação WebSocket rejeitada na autenticação', {
        reason: err.message
      });
      return next(new Error('Token WebSocket inválido ou expirado.'));
    }
  });

  ioInstance.on('connection', (socket) => {
    const user = socket.user;
    socket.join(`user:${user.id}`);

    if (user.companyId) {
      socket.join(`company:${user.companyId}`);
    }

    logger.debug('Cliente WebSocket ligado', {
      socketId: socket.id,
      userId: user.id,
      role: user.role
    });

    registerChatSocket(ioInstance, socket);
    registerTrackingSocket(ioInstance, socket);

    socket.on('disconnect', (reason) => {
      logger.debug('Cliente WebSocket desligado', {
        socketId: socket.id,
        userId: user.id,
        reason
      });
    });
  });

  logger.info('Servidor Socket.IO inicializado com sucesso.');
  return ioInstance;
}

function getIo() {
  return ioInstance;
}

function emitToUser(userId, event, payload) {
  if (!ioInstance || !userId) {
    return;
  }
  ioInstance.to(`user:${userId}`).emit(event, payload);
}

function emitToCompany(companyId, event, payload) {
  if (!ioInstance || !companyId) {
    return;
  }
  ioInstance.to(`company:${companyId}`).emit(event, payload);
}

module.exports = {
  initSockets,
  getIo,
  emitToUser,
  emitToCompany
};