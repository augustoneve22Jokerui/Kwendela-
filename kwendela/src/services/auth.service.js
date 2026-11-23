'use strict';

const { withTransaction } = require('../config/database');
const logger = require('../config/logger');
const ApiError = require('../utils/ApiError');
const {
  hashPassword,
  comparePassword,
  generateRandomToken,
  sha256,
  generateAccountCode
} = require('../utils/crypto');
const {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken
} = require('../utils/token');
const { recordAuditLog } = require('../middlewares/audit.middleware');
const authRepository = require('../repositories/auth.repository');
const userRepository = require('../repositories/user.repository');
const walletRepository = require('../repositories/wallet.repository');
const mailerIntegration = require('../integrations/mailer.integration');

function formatSafeUser(user) {
  return {
    id: user.id,
    fullName: user.full_name,
    email: user.email,
    phone: user.phone || null,
    role: user.role,
    status: user.status,
    mustChangePassword: Boolean(user.must_change_password),
    isPremium: Boolean(user.is_premium),
    premiumExpiresAt: user.premium_expires_at || null,
    avatarUrl: user.avatar_url || null,
    companyId: user.company_id || null,
    companyRole: user.company_role || null,
    companyName: user.company_name || null
  };
}

async function issueSessionTokens(user, requestMeta = {}, familyId = null, client = null) {
  const access = signAccessToken({
    userId: user.id,
    role: user.role,
    companyId: user.company_id || null,
    companyRole: user.company_role || null,
    mustChangePassword: Boolean(user.must_change_password)
  });

  const refresh = signRefreshToken({
    userId: user.id,
    familyId
  });

  await authRepository.saveRefreshToken(
    {
      userId: user.id,
      tokenHash: sha256(refresh.token),
      familyId: refresh.familyId,
      expiresAt: refresh.expiresAt,
      ipAddress: requestMeta.ip || null,
      userAgent: requestMeta.userAgent || null
    },
    client
  );

  return {
    user: formatSafeUser(user),
    accessToken: access.token,
    refreshToken: refresh.token,
    accessExpiresInMs: access.expiresInMs,
    refreshExpiresInMs: refresh.expiresInMs
  };
}

async function registerTourist(payload, requestMeta = {}) {
  const existing = await userRepository.findByEmail(payload.email);
  if (existing) {
    throw ApiError.conflict(
      'Este endereço de email já se encontra registado.',
      null,
      'EMAIL_ALREADY_EXISTS'
    );
  }

  const passwordHash = await hashPassword(payload.password);
  const accountCode = generateAccountCode('KWD');

  const createdUser = await withTransaction(async (client) => {
    const user = await userRepository.createUser(
      {
        fullName: payload.fullName,
        email: payload.email,
        phone: payload.phone || null,
        passwordHash,
        role: 'tourist',
        status: 'active',
        mustChangePassword: false,
        nationality: payload.nationality || null,
        preferredLanguage: payload.preferredLanguage || 'pt'
      },
      client
    );

    await walletRepository.createWallet(
      {
        ownerType: 'user',
        ownerUserId: user.id,
        accountCode,
        currency: 'AOA'
      },
      client
    );

    return user;
  });

  const session = await issueSessionTokens(createdUser, requestMeta);

  await recordAuditLog({
    actorUserId: createdUser.id,
    action: 'auth.register_tourist',
    entityType: 'user',
    entityId: createdUser.id,
    ipAddress: requestMeta.ip,
    userAgent: requestMeta.userAgent
  });

  try {
    await mailerIntegration.sendWelcomeEmail(createdUser);
  } catch (mailErr) {
    logger.warn('Falha ao enviar email de boas-vindas', {
      userId: createdUser.id,
      reason: mailErr.message
    });
  }

  return session;
}

async function login({ email, password }, requestMeta = {}) {
  const user = await authRepository.findUserForLogin(email);
  if (!user) {
    throw ApiError.unauthorized('Credenciais inválidas.', 'INVALID_CREDENTIALS');
  }

  const passwordMatches = await comparePassword(password, user.password_hash);
  if (!passwordMatches) {
    throw ApiError.unauthorized('Credenciais inválidas.', 'INVALID_CREDENTIALS');
  }

  if (user.status === 'suspended') {
    throw ApiError.forbidden('Esta conta encontra-se suspensa.', 'ACCOUNT_SUSPENDED');
  }

  if (user.status !== 'active') {
    throw ApiError.forbidden('Conta inativa ou pendente de verificação.', 'ACCOUNT_INACTIVE');
  }

  await authRepository.updateLastLogin(user.id);
  const session = await issueSessionTokens(user, requestMeta);

  await recordAuditLog({
    actorUserId: user.id,
    companyId: user.company_id || null,
    action: 'auth.login',
    entityType: 'user',
    entityId: user.id,
    ipAddress: requestMeta.ip,
    userAgent: requestMeta.userAgent
  });

  return session;
}

async function refreshTokens(rawRefreshToken, requestMeta = {}) {
  if (!rawRefreshToken) {
    throw ApiError.unauthorized('Refresh token obrigatório.', 'REFRESH_TOKEN_REQUIRED');
  }

  const decoded = verifyRefreshToken(rawRefreshToken);
  const tokenHash = sha256(rawRefreshToken);
  const storedToken = await authRepository.findRefreshTokenByHash(tokenHash);

  if (!storedToken) {
    throw ApiError.unauthorized('Sessão inválida ou expirada.', 'INVALID_REFRESH_TOKEN');
  }

  if (storedToken.revoked_at) {
    await authRepository.revokeRefreshTokenFamily(storedToken.family_id);
    throw ApiError.unauthorized(
      'Detetada reutilização suspeita de token. Todas as sessões associadas foram encerradas.',
      'TOKEN_REUSE_DETECTED'
    );
  }

  if (new Date(storedToken.expires_at) <= new Date()) {
    throw ApiError.unauthorized('Refresh token expirado.', 'REFRESH_TOKEN_EXPIRED');
  }

  const user = await userRepository.findAuthContextById(decoded.sub);
  if (!user || user.status !== 'active') {
    throw ApiError.unauthorized('Conta indisponível ou suspensa.', 'USER_UNAVAILABLE');
  }

  return withTransaction(async (client) => {
    await authRepository.revokeRefreshTokenById(storedToken.id, client);
    return issueSessionTokens(user, requestMeta, storedToken.family_id, client);
  });
}

async function logout(rawRefreshToken, userId = null, requestMeta = {}) {
  if (rawRefreshToken) {
    await authRepository.revokeRefreshTokenByHash(sha256(rawRefreshToken));
  }

  if (userId) {
    await recordAuditLog({
      actorUserId: userId,
      action: 'auth.logout',
      entityType: 'user',
      entityId: userId,
      ipAddress: requestMeta.ip,
      userAgent: requestMeta.userAgent
    });
  }
}

async function forgotPassword(email, requestMeta = {}) {
  const user = await userRepository.findByEmail(email);
  if (!user || user.status === 'suspended') {
    return {
      accepted: true,
      message: 'Se o email existir na plataforma, receberá instruções de recuperação.'
    };
  }

  const rawToken = generateRandomToken(32);
  const tokenHash = sha256(rawToken);
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

  await withTransaction(async (client) => {
    await authRepository.invalidatePendingPasswordResets(user.id, client);
    await authRepository.createPasswordResetToken(
      {
        userId: user.id,
        tokenHash,
        expiresAt
      },
      client
    );
  });

  try {
    await mailerIntegration.sendPasswordResetEmail(user, rawToken);
  } catch (mailErr) {
    logger.error('Erro ao enviar email de recuperação de palavra-passe', {
      userId: user.id,
      reason: mailErr.message
    });
  }

  await recordAuditLog({
    actorUserId: user.id,
    action: 'auth.forgot_password_requested',
    entityType: 'user',
    entityId: user.id,
    ipAddress: requestMeta.ip,
    userAgent: requestMeta.userAgent
  });

  return {
    accepted: true,
    message: 'Se o email existir na plataforma, receberá instruções de recuperação.'
  };
}

async function resetPassword({ token, newPassword }, requestMeta = {}) {
  const tokenHash = sha256(token);
  const resetRecord = await authRepository.findValidPasswordResetToken(tokenHash);

  if (!resetRecord) {
    throw ApiError.badRequest(
      'O token de recuperação é inválido ou já expirou.',
      null,
      'INVALID_RESET_TOKEN'
    );
  }

  const newHash = await hashPassword(newPassword);

  await withTransaction(async (client) => {
    await authRepository.updateUserPassword(
      resetRecord.user_id,
      { passwordHash: newHash, mustChangePassword: false },
      client
    );
    await authRepository.markPasswordResetTokenUsed(resetRecord.id, client);
    await authRepository.revokeAllUserRefreshTokens(resetRecord.user_id, client);
  });

  await recordAuditLog({
    actorUserId: resetRecord.user_id,
    action: 'auth.reset_password',
    entityType: 'user',
    entityId: resetRecord.user_id,
    ipAddress: requestMeta.ip,
    userAgent: requestMeta.userAgent
  });

  return { updated: true };
}

async function changePassword(userId, { currentPassword, newPassword }, requestMeta = {}) {
  const userWithHash = await authRepository.findUserWithPasswordById(userId);
  if (!userWithHash) {
    throw ApiError.notFound('Utilizador não encontrado.');
  }

  const matches = await comparePassword(currentPassword, userWithHash.password_hash);
  if (!matches) {
    throw ApiError.badRequest(
      'A palavra-passe atual está incorreta.',
      null,
      'INVALID_CURRENT_PASSWORD'
    );
  }

  const newHash = await hashPassword(newPassword);

  await withTransaction(async (client) => {
    await authRepository.updateUserPassword(
      userId,
      { passwordHash: newHash, mustChangePassword: false },
      client
    );
    await authRepository.revokeAllUserRefreshTokens(userId, client);
  });

  const refreshedUser = await userRepository.findAuthContextById(userId);
  const session = await issueSessionTokens(refreshedUser, requestMeta);

  await recordAuditLog({
    actorUserId: userId,
    companyId: refreshedUser.company_id || null,
    action: 'auth.change_password',
    entityType: 'user',
    entityId: userId,
    ipAddress: requestMeta.ip,
    userAgent: requestMeta.userAgent
  });

  return session;
}

module.exports = {
  formatSafeUser,
  registerTourist,
  login,
  refreshTokens,
  logout,
  forgotPassword,
  resetPassword,
  changePassword
};