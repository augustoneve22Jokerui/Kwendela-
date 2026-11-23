'use strict';

const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/ApiResponse');
const { parsePagination } = require('../../utils/pagination');
const reportService = require('../../services/report.service');

function extractRequestMeta(req) {
  return {
    ip: req.ip || (req.connection && req.connection.remoteAddress) || null,
    userAgent: req.get('user-agent') || null
  };
}

const createReport = asyncHandler(async (req, res) => {
  const report = await reportService.createReport(
    req.body,
    req.user,
    extractRequestMeta(req)
  );
  return ApiResponse.created(res, report, 'Denúncia submetida com sucesso.');
});

const listMyReports = asyncHandler(async (req, res) => {
  const pagination = parsePagination(req.query, { defaultLimit: 20 });
  const result = await reportService.listMyReports(req.user.id, pagination);
  return ApiResponse.paginated(res, result.items, result.pagination, 'Denúncias obtidas com sucesso.');
});

module.exports = {
  createReport,
  listMyReports
};