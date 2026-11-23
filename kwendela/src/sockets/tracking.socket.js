'use strict';

const logger = require('../config/logger');
const { normalizeCoordinates } = require('../utils/geo');
const trackingService = require('../services/tracking.service');

function registerTrackingSocket(io, socket) {
  const user = socket.user;

  socket.on('tracking:join_expedition', async (payload = {}, callback) => {
    try {
      const { expeditionId } = payload;
      if (!expeditionId) {
        if (typeof callback === 'function') {
          return callback({ ok: false, error: 'expeditionId é obrigatório.' });
        }
        return;
      }

      await trackingService.assertTrackingViewAccess(expeditionId, user);

      const roomName = `tracking:expedition:${expeditionId}`;
      await socket.join(roomName);

      if (typeof callback === 'function') {
        callback({ ok: true, room: roomName });
      }
    } catch (err) {
      logger.warn('Acesso negado à sala de rastreamento', {
        userId: user.id,
        expeditionId: payload.expeditionId,
        reason: err.message
      });
      if (typeof callback === 'function') {
        callback({ ok: false, error: err.message || 'Acesso negado ao rastreamento.' });
      }
    }
  });

  socket.on('tracking:leave_expedition', async (payload = {}, callback) => {
    try {
      const { expeditionId } = payload;
      if (expeditionId) {
        await socket.leave(`tracking:expedition:${expeditionId}`);
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

  socket.on('tracking:update_location', async (payload = {}, callback) => {
    try {
      const {
        expeditionId,
        latitude,
        longitude,
        accuracyMeters = null,
        speedKmh = null,
        heading = null,
        consentGranted = false
      } = payload;

      if (!expeditionId) {
        if (typeof callback === 'function') {
          return callback({ ok: false, error: 'expeditionId é obrigatório.' });
        }
        return;
      }

      const coords = normalizeCoordinates(latitude, longitude);
      if (!coords) {
        if (typeof callback === 'function') {
          return callback({ ok: false, error: 'Coordenadas geográficas inválidas.' });
        }
        return;
      }

      const savedPoint = await trackingService.recordLivePosition({
        expeditionId,
        user,
        latitude: coords.latitude,
        longitude: coords.longitude,
        accuracyMeters,
        speedKmh,
        heading,
        consentGranted: Boolean(consentGranted)
      });

      const roomName = `tracking:expedition:${expeditionId}`;
      io.to(roomName).emit('tracking:location_updated', savedPoint);

      if (typeof callback === 'function') {
        callback({ ok: true, data: savedPoint });
      }
    } catch (err) {
      logger.warn('Erro ao atualizar localização em tempo real', {
        userId: user.id,
        expeditionId: payload.expeditionId,
        reason: err.message
      });
      if (typeof callback === 'function') {
        callback({ ok: false, error: err.message || 'Falha ao atualizar localização.' });
      }
    }
  });

  socket.on('tracking:stop_sharing', async (payload = {}, callback) => {
    try {
      const { expeditionId } = payload;
      if (!expeditionId) {
        if (typeof callback === 'function') {
          return callback({ ok: false, error: 'expeditionId é obrigatório.' });
        }
        return;
      }

      await trackingService.stopLiveSharing(expeditionId, user);

      const roomName = `tracking:expedition:${expeditionId}`;
      io.to(roomName).emit('tracking:sharing_stopped', {
        expeditionId,
        userId: user.id,
        stoppedAt: new Date().toISOString()
      });

      if (typeof callback === 'function') {
        callback({ ok: true });
      }
    } catch (err) {
      if (typeof callback === 'function') {
        callback({ ok: false, error: err.message });
      }
    }
  });
}

module.exports = registerTrackingSocket;