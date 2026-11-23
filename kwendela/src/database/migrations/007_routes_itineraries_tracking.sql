-- ============================================================================
-- 007_routes_itineraries_tracking.sql
-- Rotas, Pontos de Interesse (PostGIS), Itinerários e Rastreamento em Tempo Real
-- ============================================================================

CREATE TABLE IF NOT EXISTS routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  destination_id UUID REFERENCES destinations(id) ON DELETE SET NULL,
  title VARCHAR(180) NOT NULL,
  slug VARCHAR(220) NOT NULL UNIQUE,
  description TEXT,
  transport_mode VARCHAR(24) NOT NULL DEFAULT 'driving'
    CHECK (transport_mode IN ('driving', 'walking', '4x4', 'boat', 'mixed')),
  total_distance_km NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  estimated_duration_minutes INTEGER NOT NULL DEFAULT 0,
  route_geojson JSONB,
  is_public BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_routes_access
  ON routes (is_public, company_id, created_by_user_id);

CREATE INDEX IF NOT EXISTS idx_routes_destination
  ON routes (destination_id)
  WHERE destination_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_expeditions_route'
      AND table_name = 'expeditions'
  ) THEN
    ALTER TABLE expeditions
      ADD CONSTRAINT fk_expeditions_route
      FOREIGN KEY (route_id) REFERENCES routes(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS route_waypoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id UUID NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  title VARCHAR(160) NOT NULL,
  description TEXT,
  waypoint_type VARCHAR(24) NOT NULL DEFAULT 'poi'
    CHECK (waypoint_type IN ('start', 'stop', 'poi', 'viewpoint', 'meal', 'lodging', 'end')),
  latitude DOUBLE PRECISION NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude DOUBLE PRECISION NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  location GEOGRAPHY(Point, 4326),
  stop_order INTEGER NOT NULL DEFAULT 0,
  estimated_minutes_at_stop INTEGER NOT NULL DEFAULT 0,
  scheduled_time VARCHAR(40),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_route_waypoints_order
  ON route_waypoints (route_id, stop_order);

CREATE INDEX IF NOT EXISTS idx_route_waypoints_location_gist
  ON route_waypoints USING GIST (location);

CREATE TABLE IF NOT EXISTS route_itinerary_days (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id UUID NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  day_number INTEGER NOT NULL CHECK (day_number >= 1),
  title VARCHAR(160) NOT NULL,
  summary TEXT,
  activities JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (route_id, day_number)
);

CREATE TABLE IF NOT EXISTS expedition_tracking_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expedition_id UUID NOT NULL REFERENCES expeditions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_sharing BOOLEAN NOT NULL DEFAULT FALSE,
  consented_at TIMESTAMPTZ,
  stopped_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (expedition_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_tracking_consents_active
  ON expedition_tracking_consents (expedition_id, is_sharing);

CREATE TABLE IF NOT EXISTS expedition_location_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expedition_id UUID NOT NULL REFERENCES expeditions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  latitude DOUBLE PRECISION NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude DOUBLE PRECISION NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  location GEOGRAPHY(Point, 4326),
  accuracy_meters NUMERIC(10, 2),
  speed_kmh NUMERIC(8, 2),
  heading NUMERIC(6, 2),
  source VARCHAR(24) NOT NULL DEFAULT 'realtime'
    CHECK (source IN ('realtime', 'offline_sync')),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_location_points_expedition_user_time
  ON expedition_location_points (expedition_id, user_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_location_points_expedition_time
  ON expedition_location_points (expedition_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_location_points_location_gist
  ON expedition_location_points USING GIST (location);