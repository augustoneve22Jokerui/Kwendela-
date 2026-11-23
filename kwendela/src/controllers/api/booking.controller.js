'use strict';

const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/ApiResponse');
const { parsePagination } = require('../../utils/pagination');
const bookingService = require('../../services/booking.service');

function extractRequestMeta(req) {
  return {
    ip: req.ip || (req.connection && req.connection.remoteAddress) || null,
    userAgent: req.get('user-agent') || null
  };
}

const createBooking = asyncHandler(async (req, res) => {
  const booking = await bookingService.createBooking(
    req.body,
    req.user,
    extractRequestMeta(req)
  );
  return ApiResponse.created(res, booking, 'Reserva confirmada com sucesso.');
});

const listMyBookings = asyncHandler(async (req, res) => {
  const pagination = parsePagination(req.query, { defaultLimit: 12 });
  const filters = {
    status: req.query.status
  };
  const result = await bookingService.listTouristBookings(req.user.id, filters, pagination);
  return ApiResponse.paginated(res, result.items, result.pagination, 'Reservas obtidas com sucesso.');
});

const listMyWaitlist = asyncHandler(async (req, res) => {
  const entries = await bookingService.listTouristWaitlist(req.user.id);
  return ApiResponse.success(res, entries, 'Lista de espera pessoal obtida com sucesso.');
});

const getBookingDetails = asyncHandler(async (req, res) => {
  const booking = await bookingService.getBookingDetails(req.params.id, req.user);
  return ApiResponse.success(res, booking, 'Detalhes da reserva obtidos com sucesso.');
});

const cancelBooking = asyncHandler(async (req, res) => {
  const outcome = await bookingService.cancelBooking(
    req.params.id,
    req.body || {},
    req.user,
    extractRequestMeta(req)
  );
  return ApiResponse.success(res, outcome, 'Reserva cancelada com sucesso.');
});

const joinWaitlist = asyncHandler(async (req, res) => {
  const entry = await bookingService.joinWaitlist(
    req.params.expeditionId,
    req.body,
    req.user
  );
  return ApiResponse.created(res, entry, 'Inscrição na lista de espera realizada com sucesso.');
});

const confirmWaitlistSpot = asyncHandler(async (req, res) => {
  const booking = await bookingService.confirmWaitlistSpot(
    req.params.waitlistId,
    req.body || {},
    req.user,
    extractRequestMeta(req)
  );
  return ApiResponse.created(res, booking, 'Vaga da lista de espera confirmada com sucesso.');
});

const listCompanyBookings = asyncHandler(async (req, res) => {
  const pagination = parsePagination(req.query, { defaultLimit: 20 });
  const filters = {
    status: req.query.status,
    expeditionId: req.query.expeditionId,
    search: req.query.search
  };
  const result = await bookingService.listCompanyBookings(req.company.id, filters, pagination);
  return ApiResponse.paginated(res, result.items, result.pagination, 'Reservas da empresa obtidas com sucesso.');
});

const updateCompanyBookingStatus = asyncHandler(async (req, res) => {
  const updated = await bookingService.updateCompanyBookingStatus(
    req.params.id,
    req.company.id,
    req.body,
    req.user,
    extractRequestMeta(req)
  );
  return ApiResponse.success(res, updated, 'Estado da reserva atualizado com sucesso.');
});

const listExpeditionWaitlist = asyncHandler(async (req, res) => {
  const waitlist = await bookingService.listExpeditionWaitlist(
    req.params.expeditionId,
    req.company.id
  );
  return ApiResponse.success(res, waitlist, 'Lista de espera da expedição obtida com sucesso.');
});

module.exports = {
  createBooking,
  listMyBookings,
  listMyWaitlist,
  getBookingDetails,
  cancelBooking,
  joinWaitlist,
  confirmWaitlistSpot,
  listCompanyBookings,
  updateCompanyBookingStatus,
  listExpeditionWaitlist
};