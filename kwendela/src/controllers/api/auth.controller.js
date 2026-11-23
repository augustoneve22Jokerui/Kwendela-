'use strict';

const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/ApiResponse');
const { getAuthCookieOptions } = require('../../utils/token');
const authService = require('../../services/auth.service');

function extractRequestMeta(req) {
  return {
    ip: req.ip || (req.connection && req.connection.remoteAddress) || null,
    userAgent: req.get('user-agent') || null
  };
}

function setSessionCookies(res, session) {
  res.cookie(
    'kwendela_access_token',
    session.accessToken,
    getAuthCookieOptions(session.accessExpiresInMs)
  );
  res.cookie(
    'kwendela_refresh_token',
    session.refreshToken,
    getAuthCookieOptions(session.refreshExpiresInMs)
  );
}

function clearSessionCookies(res) {
  res.clearCookie('kwendela_access_token', { path: '/' });
  res.clearCookie('kwendela_refresh_token', { path: '/' });
}

const register = asyncHandler(async (req, res) => {
  const session = await authService.registerTourist(req.body, extractRequestMeta(req));
  setSessionCookies(res, session);

  return ApiResponse.created(
    res,
    {
      user: session.user,
      accessToken: session.accessToken,
      refreshToken: session.refreshToken
    },
    'Conta criada com sucesso.'
  );
});

const login = asyncHandler(async (req, res) => {
  const session = await authService.login(req.body, extractRequestMeta(req));
  setSessionCookies(res, session);

  return ApiResponse.success(
    res,
    {
      user: session.user,
      accessToken: session.accessToken,
      refreshToken: session.refreshToken
    },
    session.user.mustChangePassword
      ? 'Sessão iniciada. É obrigatório alterar a palavra-passe inicial.'
      : 'Sessão iniciada com sucesso.'
  );
});

const refresh = asyncHandler(async (req, res) => {
  const rawRefreshToken =
    (req.body && req.body.refreshToken) ||
    (req.cookies && req.cookies.kwendela_refresh_token) ||
    null;

  const session = await authService.refreshTokens(rawRefreshToken, extractRequestMeta(req));
  setSessionCookies(res, session);

  return ApiResponse.success(
    res,
    {
      user: session.user,
      accessToken: session.accessToken,
      refreshToken: session.refreshToken
    },
    'Sessão renovada com sucesso.'
  );
});

const logout = asyncHandler(async (req, res) => {
  const rawRefreshToken =
    (req.body && req.body.refreshToken) ||
    (req.cookies && req.cookies.kwendela_refresh_token) ||
    null;

  await authService.logout(
    rawRefreshToken,
    req.user ? req.user.id : null,
    extractRequestMeta(req)
  );

  clearSessionCookies(res);
  return ApiResponse.success(res, null, 'Sessão encerrada com sucesso.');
});

const me = asyncHandler(async (req, res) => {
  return ApiResponse.success(res, req.user, 'Utilizador autenticado obtido com sucesso.');
});

const forgotPassword = asyncHandler(async (req, res) => {
  const result = await authService.forgotPassword(req.body.email, extractRequestMeta(req));
  return ApiResponse.success(res, result, result.message);
});

const resetPassword = asyncHandler(async (req, res) => {
  await authService.resetPassword(req.body, extractRequestMeta(req));
  clearSessionCookies(res);
  return ApiResponse.success(res, null, 'Palavra-passe redefinida com sucesso.');
});

const changePassword = asyncHandler(async (req, res) => {
  const session = await authService.changePassword(
    req.user.id,
    req.body,
    extractRequestMeta(req)
  );
  setSessionCookies(res, session);

  return ApiResponse.success(
    res,
    {
      user: session.user,
      accessToken: session.accessToken,
      refreshToken: session.refreshToken
    },
    'Palavra-passe alterada com sucesso.'
  );
});

module.exports = {
  register,
  login,
  refresh,
  logout,
  me,
  forgotPassword,
  resetPassword,
  changePassword
};