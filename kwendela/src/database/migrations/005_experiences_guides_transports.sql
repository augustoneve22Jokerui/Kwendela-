-- ============================================================================
-- 005_experiences_guides_transports.sql
-- Experiências, Passeios, Multimédia, Guias Turísticos e Transportes
-- ============================================================================

CREATE TABLE IF NOT EXISTS experiences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  destination_id UUID NOT NULL REFERENCES destinations(id) ON DELETE RESTRICT,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  title VARCHAR(180) NOT NULL,
  slug VARCHAR(220) NOT NULL UNIQUE,
  short_description VARCHAR(320) NOT NULL,
  description TEXT NOT NULL,
  category VARCHAR(40) NOT NULL DEFAULT 'culture'
    CHECK (category IN ('nature', 'culture', 'adventure', 'gastronomy', 'city_tour', 'safari', 'beach', 'heritage', 'other')),
  experience_type VARCHAR(20) NOT NULL DEFAULT 'experience'
    CHECK (experience_type IN ('experience', 'tour')),
  duration_hours NUMERIC(5, 1) NOT NULL CHECK (duration_hours > 0),
  price_kz NUMERIC(14, 2) NOT NULL CHECK (price_kz >= 0),
  max_group_size INTEGER NOT NULL DEFAULT 15 CHECK (max_group_size >= 1),
  difficulty_level VARCHAR(24) NOT NULL DEFAULT 'moderate'
    CHECK (difficulty_level IN ('easy', 'moderate', 'challenging', 'extreme')),
  includes JSONB NOT NULL DEFAULT '[]'::jsonb,
  excludes JSONB NOT NULL DEFAULT '[]'::jsonb,
  requirements JSONB NOT NULL DEFAULT '[]'::jsonb,
  meeting_point VARCHAR(300),
  languages JSONB NOT NULL DEFAULT '["Português"]'::jsonb,
  cover_image_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  rating_avg NUMERIC(3, 2) NOT NULL DEFAULT 0.00,
  reviews_count INTEGER NOT NULL DEFAULT 0,
  moderation_status VARCHAR(32) NOT NULL DEFAULT 'pending_review'
    CHECK (moderation_status IN ('pending_review', 'approved', 'rejected', 'archived')),
  moderation_notes TEXT,
  moderated_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  moderated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_experiences_public_listing
  ON experiences (moderation_status, is_active, category, price_kz);

CREATE INDEX IF NOT EXISTS idx_experiences_company_status
  ON experiences (company_id, moderation_status);

CREATE INDEX IF NOT EXISTS idx_experiences_destination
  ON experiences (destination_id, moderation_status);

CREATE TABLE IF NOT EXISTS experience_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experience_id UUID NOT NULL REFERENCES experiences(id) ON DELETE CASCADE,
  media_type VARCHAR(20) NOT NULL DEFAULT 'image'
    CHECK (media_type IN ('image', 'video')),
  url TEXT NOT NULL,
  caption VARCHAR(255),
  is_cover BOOLEAN NOT NULL DEFAULT FALSE,
  display_order INTEGER NOT NULL DEFAULT 0,
  uploaded_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_experience_media_experience
  ON experience_media (experience_id, is_cover DESC, display_order ASC);

CREATE TABLE IF NOT EXISTS guides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  full_name VARCHAR(140) NOT NULL,
  email VARCHAR(180),
  phone VARCHAR(40) NOT NULL,
  languages JSONB NOT NULL DEFAULT '["Português"]'::jsonb,
  specialties JSONB NOT NULL DEFAULT '[]'::jsonb,
  license_number VARCHAR(80),
  bio TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_guides_company_active
  ON guides (company_id, is_active);

CREATE TABLE IF NOT EXISTS transports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name VARCHAR(140) NOT NULL,
  vehicle_type VARCHAR(32) NOT NULL
    CHECK (vehicle_type IN ('4x4', 'van', 'minibus', 'bus', 'boat', 'aircraft', 'other')),
  plate_number VARCHAR(40),
  capacity INTEGER NOT NULL CHECK (capacity >= 1),
  has_ac BOOLEAN NOT NULL DEFAULT TRUE,
  features JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transports_company_active
  ON transports (company_id, is_active);