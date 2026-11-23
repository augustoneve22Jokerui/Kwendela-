-- ============================================================================
-- 003_plans_companies_subscriptions.sql
-- Planos Empresariais Configuráveis, Empresas, Membros e Assinaturas
-- ============================================================================

CREATE TABLE IF NOT EXISTS plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(60) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  description TEXT,
  price_kz NUMERIC(14, 2) NOT NULL CHECK (price_kz >= 0),
  billing_cycle VARCHAR(20) NOT NULL DEFAULT 'monthly'
    CHECK (billing_cycle IN ('monthly', 'quarterly', 'yearly')),
  max_users INTEGER,
  max_experiences INTEGER,
  max_destinations INTEGER,
  features JSONB NOT NULL DEFAULT '{}'::jsonb,
  limits JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_plans_active_order
  ON plans (is_active, display_order, price_kz);

CREATE TABLE IF NOT EXISTS companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  name VARCHAR(160) NOT NULL,
  slug VARCHAR(200) NOT NULL UNIQUE,
  legal_name VARCHAR(200),
  tax_id VARCHAR(60),
  email VARCHAR(180) NOT NULL,
  phone VARCHAR(40) NOT NULL,
  website VARCHAR(255),
  description TEXT,
  province VARCHAR(100) NOT NULL,
  city VARCHAR(100) NOT NULL,
  address VARCHAR(255),
  logo_url TEXT,
  cover_url TEXT,
  social_links JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(32) NOT NULL DEFAULT 'active'
    CHECK (status IN ('pending_verification', 'active', 'suspended', 'rejected')),
  is_verified BOOLEAN NOT NULL DEFAULT FALSE,
  rating_avg NUMERIC(3, 2) NOT NULL DEFAULT 0.00,
  reviews_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_companies_status_province
  ON companies (status, province);

CREATE INDEX IF NOT EXISTS idx_companies_owner_user_id
  ON companies (owner_user_id);

CREATE TABLE IF NOT EXISTS company_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(32) NOT NULL DEFAULT 'staff'
    CHECK (role IN ('owner', 'admin', 'manager', 'guide', 'staff')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_company_members_user_active
  ON company_members (user_id, is_active);

CREATE INDEX IF NOT EXISTS idx_company_members_company_active
  ON company_members (company_id, is_active);

CREATE TABLE IF NOT EXISTS company_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,
  status VARCHAR(24) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'expired', 'cancelled', 'pending')),
  starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at TIMESTAMPTZ,
  price_kz NUMERIC(14, 2) NOT NULL CHECK (price_kz >= 0),
  auto_renew BOOLEAN NOT NULL DEFAULT FALSE,
  assigned_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  notes TEXT,
  expiry_notified_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_company_subscriptions_company_status
  ON company_subscriptions (company_id, status, ends_at);

CREATE INDEX IF NOT EXISTS idx_company_subscriptions_active_expiry
  ON company_subscriptions (ends_at)
  WHERE status = 'active';