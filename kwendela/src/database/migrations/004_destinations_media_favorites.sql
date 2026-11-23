-- ============================================================================
-- 004_destinations_media_favorites.sql
-- Destinos Turísticos (PostGIS), Multimédia e Favoritos
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS destinations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  name VARCHAR(160) NOT NULL,
  slug VARCHAR(200) NOT NULL UNIQUE,
  country VARCHAR(80) NOT NULL DEFAULT 'Angola',
  province VARCHAR(100) NOT NULL,
  municipality VARCHAR(100),
  category VARCHAR(40) NOT NULL DEFAULT 'nature'
    CHECK (category IN ('nature', 'culture', 'adventure', 'gastronomy', 'city_tour', 'safari', 'beach', 'heritage', 'other')),
  short_description VARCHAR(320) NOT NULL,
  description TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude DOUBLE PRECISION NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  location GEOGRAPHY(Point, 4326),
  best_season VARCHAR(160),
  highlights JSONB NOT NULL DEFAULT '[]'::jsonb,
  practical_info JSONB NOT NULL DEFAULT '{}'::jsonb,
  cover_image_url TEXT,
  is_featured BOOLEAN NOT NULL DEFAULT FALSE,
  views_count INTEGER NOT NULL DEFAULT 0,
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

CREATE INDEX IF NOT EXISTS idx_destinations_location_gist
  ON destinations USING GIST (location);

CREATE INDEX IF NOT EXISTS idx_destinations_moderation_province
  ON destinations (moderation_status, province, category);

CREATE INDEX IF NOT EXISTS idx_destinations_company_status
  ON destinations (company_id, moderation_status);

CREATE INDEX IF NOT EXISTS idx_destinations_featured_rating
  ON destinations (is_featured, rating_avg DESC)
  WHERE moderation_status = 'approved';

CREATE TABLE IF NOT EXISTS destination_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid()