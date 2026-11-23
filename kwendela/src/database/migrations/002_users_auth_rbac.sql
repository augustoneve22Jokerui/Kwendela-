-- ============================================================================
-- 002_users_auth_rbac.sql
-- Utilizadores, Autenticação JWT/Refresh Tokens e Recuperação de Palavra-passe
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name VARCHAR(160) NOT NULL,
  email VARCHAR(180) NOT NULL,
  phone VARCHAR(40),
  password_hash TEXT NOT NULL,
  role VARCHAR(32) NOT NULL DEFAULT 'tourist'
    CHECK (role IN ('superadmin', 'tourist', 'company_owner', 'company_admin', 'company_staff', 'guide')),
  status VARCHAR(32) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended', 'pending_verification')),
  must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
  is_premium BOOLEAN NOT NULL DEFAULT FALSE,
  premium_expires_at TIMESTAMPTZ,
  avatar_url TEXT,
  bio TEXT,
  province VARCHAR(100),
  city VARCHAR(100),
  nationality VARCHAR(80),
  preferred_language VARCHAR(10) NOT NULL DEFAULT 'pt'
    CHECK (preferred_language IN ('pt', 'en', 'fr')),
  password_changed_at TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email_lower
  ON users (LOWER(email));

CREATE INDEX IF NOT EXISTS idx_users_role_status
  ON users (role, status);

CREATE INDEX IF NOT EXISTS idx_users_premium
  ON users (is_premium, premium_expires_at)
  WHERE is_premium = TRUE;

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(128) NOT NULL UNIQUE,
  family_id UUID NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  ip_address VARCHAR(64),
  user_agent VARCHAR(500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id
  ON refresh_tokens (user_id);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_family_id
  ON refresh_tokens (family_id);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_active
  ON refresh_tokens (expires_at)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(128) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id
  ON password_reset_tokens (user_id);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_valid
  ON password_reset_tokens (expires_at)
  WHERE used_at IS NULL;