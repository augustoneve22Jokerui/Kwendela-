'use strict';

const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/ApiResponse');
const { parsePagination } = require('../../utils/pagination');
const companyService = require('../../services/company.service');

function extractRequestMeta(req) {
  return {
    ip: req.ip || (req.connection && req.connection.remoteAddress) || null,
    userAgent: req.get('user-agent') || null
  };
}

const getDashboard = asyncHandler(async (req, res) => {
  const dashboard = await companyService.getCompanyDashboard(req.company.id);
  return ApiResponse.success(res, dashboard, 'Dashboard empresarial obtido com sucesso.');
});

const getProfile = asyncHandler(async (req, res) => {
  const profile = await companyService.getCompanyProfile(req.company.id);
  return ApiResponse.success(res, profile, 'Perfil da empresa obtido com sucesso.');
});

const updateProfile = asyncHandler(async (req, res) => {
  const updated = await companyService.updateCompanyProfile(
    req.company.id,
    req.body,
    req.user,
    extractRequestMeta(req)
  );
  return ApiResponse.success(res, updated, 'Perfil da empresa atualizado com sucesso.');
});

const updateMedia = asyncHandler(async (req, res) => {
  const type = req.body && req.body.mediaField === 'cover' ? 'cover' : 'logo';
  const uploadedUrl = req.uploadedFile ? req.uploadedFile.url : null;

  const updated = await companyService.updateCompanyMedia(
    req.company.id,
    {
      logoUrl: type === 'logo' ? uploadedUrl || req.body.logoUrl : null,
      coverUrl: type === 'cover' ? uploadedUrl || req.body.coverUrl : null
    },
    req.user
  );
  return ApiResponse.success(res, updated, 'Imagem da empresa atualizada com sucesso.');
});

const listTeam = asyncHandler(async (req, res) => {
  const members = await companyService.listTeamMembers(req.company.id);
  return ApiResponse.success(res, members, 'Equipa da empresa obtida com sucesso.');
});

const addTeamMember = asyncHandler(async (req, res) => {
  const member = await companyService.addTeamMember(
    req.company.id,
    req.body,
    req.user,
    extractRequestMeta(req)
  );
  return ApiResponse.created(res, member, 'Membro adicionado à equipa com sucesso.');
});

const updateTeamMember = asyncHandler(async (req, res) => {
  const updated = await companyService.updateTeamMember(
    req.company.id,
    req.params.memberId,
    req.body,
    req.user,
    extractRequestMeta(req)
  );
  return ApiResponse.success(res, updated, 'Membro da equipa atualizado com sucesso.');
});

const listGuides = asyncHandler(async (req, res) => {
  const guides = await companyService.listGuides(req.company.id);
  return ApiResponse.success(res, guides, 'Guias turísticos obtidos com sucesso.');
});

const createGuide = asyncHandler(async (req, res) => {
  const guide = await companyService.createGuide(req.company.id, req.body, req.user);
  return ApiResponse.created(res, guide, 'Guia turístico registado com sucesso.');
});

const updateGuide = asyncHandler(async (req, res) => {
  const updated = await companyService.updateGuide(
    req.company.id,
    req.params.guideId,
    req.body,
    req.user
  );
  return ApiResponse.success(res, updated, 'Guia turístico atualizado com sucesso.');
});

const listTransports = asyncHandler(async (req, res) => {
  const transports = await companyService.listTransports(req.company.id);
  return ApiResponse.success(res, transports, 'Transportes obtidos com sucesso.');
});

const createTransport = asyncHandler(async (req, res) => {
  const transport = await companyService.createTransport(req.company.id, req.body, req.user);
  return ApiResponse.created(res, transport, 'Transporte registado com sucesso.');
});

const updateTransport = asyncHandler(async (req, res) => {
  const updated = await companyService.updateTransport(
    req.company.id,
    req.params.transportId,
    req.body,
    req.user
  );
  return ApiResponse.success(res, updated, 'Transporte atualizado com sucesso.');
});

const getFinanceSummary = asyncHandler(async (req, res) => {
  const pagination = parsePagination(req.query, { defaultLimit: 20 });
  const summary = await companyService.getCompanyFinanceSummary(req.company.id, pagination);
  return ApiResponse.success(res, summary, 'Resumo financeiro da empresa obtido com sucesso.');
});

const getReports = asyncHandler(async (req, res) => {
  const filters = {
    startDate: req.query.startDate,
    endDate: req.query.endDate
  };
  const reports = await companyService.getCompanyReports(req.company.id, filters);
  return ApiResponse.success(res, reports, 'Relatórios operacionais obtidos com sucesso.');
});

const getSubscription = asyncHandler(async (req, res) => {
  const subscription = await companyService.getCompanySubscription(req.company.id);
  return ApiResponse.success(res, subscription, 'Assinatura empresarial obtida com sucesso.');
});

const changeSubscription = asyncHandler(async (req, res) => {
  const subscription = await companyService.changeCompanySubscription(
    req.company.id,
    req.body,
    req.user,
    extractRequestMeta(req)
  );
  return ApiResponse.success(res, subscription, 'Plano empresarial atualizado com sucesso.');
});

module.exports = {
  getDashboard,
  getProfile,
  updateProfile,
  updateMedia,
  listTeam,
  addTeamMember,
  updateTeamMember,
  listGuides,
  createGuide,
  updateGuide,
  listTransports,
  createTransport,
  updateTransport,
  getFinanceSummary,
  getReports,
  getSubscription,
  changeSubscription
};
