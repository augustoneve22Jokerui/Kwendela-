'use strict';

const asyncHandler = require('../../utils/asyncHandler');
const { getAuthCookieOptions } = require('../../utils/token');
const authService = require('../../services/auth.service');

function getSafeRedirectPath(nextPath, user) {
  if (
    nextPath &&
    typeof nextPath === 'string' &&
    nextPath.startsWith('/') &&
    !nextPath.startsWith('//')
  ) {
    return nextPath;
  }

  if (!user) {
    return '/';
  }

  if (user.mustChangePassword) {
    return '/auth/force-change-password';
  }

  if (user.role === 'superadmin') {
    return '/admin';
  }

  if (['company_owner', 'company_admin', 'company_staff', 'guide'].includes(user.role)) {
    return '/company';
  }

  return '/tourist/trips';
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

function setFlashCookie(res, payload) {
  res.cookie('kwendela_flash', JSON.stringify(payload), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 1000
  });
}

const renderLogin = (req, res) => {
  if (req.user) {
    return res.redirect(getSafeRedirectPath(req.query.next, req.user));
  }

  return res.render('pages/auth/login', {
    layout: 'layouts/auth',
    title: 'Iniciar Sessão — KWENDELA',
    nextUrl: req.query.next || ''
  });
};

const renderRegister = (req, res) => {
  if (req.user) {
    return res.redirect(getSafeRedirectPath(null, req.user));
  }

  return res.render('pages/auth/register', {
    layout: 'layouts/auth',
    title: 'Criar Conta — KWENDELA'
  });
};

const renderForgotPassword = (_req, res) => {
  return res.render('pages/auth/forgot-password', {
    layout: 'layouts/auth',
    title: 'Recuperar Palavra-passe — KWENDELA'
  });
};

const renderResetPassword = (req, res) => {
  return res.render('pages/auth/reset-password', {
    layout: 'layouts/auth',
    title: 'Redefinir Palavra-passe — KWENDELA',
    token: req.query.token || ''
  });
};

const renderForceChangePassword = (req, res) => {
  if (!req.user) {
    return res.redirect('/auth/login');
  }

  return res.render('pages/auth/force-change-password', {
    layout: 'layouts/auth',
    title: 'Definir Nova Palavra-passe — KWENDELA'
  });
};

const handleWebLogin = asyncHandler(async (req, res) => {
  try {
    const session = await authService.login(req.body, {
      ip: req.ip,
      userAgent: req.get('user-agent')
    });
    setSessionCookies(res, session);
    return res.redirect(getSafeRedirectPath(req.body.next, session.user));
  } catch (err) {
    setFlashCookie(res, { error: err.message || 'Credenciais inválidas.' });
    return res.redirect('/auth/login');
  }
});

const handleWebRegister = asyncHandler(async (req, res) => {
  try {
    const session = await authService.registerTourist(req.body, {
      ip: req.ip,
      userAgent: req.get('user-agent')
    });
    setSessionCookies(res, session);
    setFlashCookie(res, { success: 'Conta criada com sucesso. Bem-vindo ao KWENDELA!' });
    return res.redirect('/tourist/profile');
  } catch (err) {
    setFlashCookie(res, { error: err.message || 'Não foi possível criar a conta.' });
    return res.redirect('/auth/register');
  }
});

const handleWebForceChangePassword = asyncHandler(async (req, res) => {
  try {
    const session = await authService.changePassword(req.user.id, req.body, {
      ip: req.ip,
      userAgent: req.get('user-agent')
    });
    setSessionCookies(res, session);
    setFlashCookie(res, { success: 'Palavra-passe atualizada com sucesso.' });
    return res.redirect(getSafeRedirectPath(null, session.user));
  } catch (err) {
    setFlashCookie(res, { error: err.message || 'Erro ao atualizar palavra-passe.' });
    return res.redirect('/auth/force-change-password');
  }
});

const handleWebLogout = asyncHandler(async (req, res) => {
  const rawRefreshToken = req.cookies && req.cookies.kwendela_refresh_token;
  await authService.logout(rawRefreshToken, req.user ? req.user.id : null, {
    ip: req.ip,
    userAgent: req.get('user-agent')
  });

  res.clearCookie('kwendela_access_token', { path: '/' });
  res.clearCookie('kwendela_refresh_token', { path: '/' });
  setFlashCookie(res, { info: 'Sessão encerrada com segurança.' });
  return res.redirect('/');
});

module.exports = {
  renderLogin,
  renderRegister,
  renderForgotPassword,
  renderResetPassword,
  renderForceChangePassword,
  handleWebLogin,
  handleWebRegister,
  handleWebForceChangePassword,
  handleWebLogout
};