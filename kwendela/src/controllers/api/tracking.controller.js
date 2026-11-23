'use strict';

const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/ApiResponse');
const { getIo } = require('../../sockets');
const trackingService = require('../../services/tracking.service');

const recordPosition = asyncHandler(async (req, res) => {
  const savedPoint = await trackingService.recordLivePosition({
    expeditionId: req.params.expeditionId,
    user: req.user,
    latitude: req.body.latitude,
    longitude: req.body.longitude,
    accuracyMeters: req.body.accuracyMeters,
    speedKmh: req.body.speedKmh,
    heading: req.body.heading,
    recordedAt: req.body.recordedAt,
    consentGranted: req.body.consentGranted
  });

  const io = getIo();
  if (io) {
    io.to(`tracking:expedition:${req.params.expeditionId}`).emit(
      'tracking:location_updated',
      savedPoint
    );
  }

  return ApiResponse.created(res, savedPoint, 'Posição registada com sucesso.');
});

const stopSharing = asyncHandler(async (req, res) => {
  const result = await trackingService.stopLiveSharing(req.params.expeditionId, req.user);

  const io = getIo();
  if (io) {
    io.to(`tracking:expedition:${req.params.expeditionId}`).emit('tracking:sharing_stopped', {
      expeditionId: req.params.expeditionId,
      userId: req.user.id,
      stoppedAt: new Date().toISOString()
    });
  }

  return ApiResponse.success(res, result, 'Partilha de localização encerrada.');
});

const syncOfflinePositions = asyncHandler(async (req, res) => {
  const result = await trackingService.syncOfflinePoints({
    expeditionId: req.params.expeditionId,
    user: req.user,
    consentGranted: req.body.consentGranted,
    points: req.body.points
  });

  return ApiResponse.created(res, result, 'Pontos de localização sincronizados com sucesso.');
});

const getExpeditionHistory = asyncHandler(async (req, res) => {
  const filters = {
    userId: req.query.userId,
    limit: req.query.limit
  };
  const history = await trackingService.getExpeditionTrackingHistory(
    req.params.expeditionId,
    req.user,
    filters
  );
  return ApiResponse.success(res, history, 'Histórico de localização obtido com sucesso.');
});

module.exports = {
  recordPosition,
  stopSharing,
  syncOfflinePositions,
  getExpeditionHistory
};