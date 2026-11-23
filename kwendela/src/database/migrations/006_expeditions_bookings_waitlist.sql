-- ============================================================================
-- 006_expeditions_bookings_waitlist.sql
-- Expedições, Reservas, Participantes e Lista de Espera Ordenada
-- ============================================================================

CREATE TABLE IF NOT EXISTS expeditions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  experience_id UUID REFERENCES experiences(id) ON DELETE SET NULL,
  destination_id UUID NOT NULL REFERENCES destinations(id) ON DELETE RESTRICT,
  guide_id UUID REFERENCES guides(id) ON DELETE SET NULL,
  transport_id UUID REFERENCES transports(id) ON DELETE SET NULL,
  route_id UUID,
  title VARCHAR(180) NOT NULL,
  slug VARCHAR(220) NOT NULL UNIQUE,
  description TEXT NOT NULL,
  min_capacity INTEGER NOT NULL DEFAULT 1 CHECK (min_capacity >= 1),
  max_capacity INTEGER NOT NULL CHECK (max_capacity >= min_capacity),
  reserved_spots INTEGER NOT NULL DEFAULT 0 CHECK (reserved_spots >= 0 AND reserved_spots <= max_capacity),
  price_per_participant NUMERIC(14, 2) NOT NULL CHECK (price_per_participant >= 0),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL CHECK (end_date >= start_date),
  departure_time VARCHAR(10),
  meeting_point VARCHAR(300),
  conditions TEXT,
  cancellation_policy TEXT,
  waitlist_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  status VARCHAR(24) NOT NULL DEFAULT 'open'
    CHECK (status IN ('draft', 'published', 'open', 'full', 'in_progress', 'completed', 'cancelled')),
  cover_image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expeditions_public_schedule
  ON expeditions (status, start_date, price_per_participant);

CREATE INDEX IF NOT EXISTS idx_expeditions_company_status
  ON expeditions (company_id, status, start_date DESC);

CREATE INDEX IF NOT EXISTS idx_expeditions_destination
  ON expeditions (destination_id, status);

CREATE INDEX IF NOT EXISTS idx_expeditions_route_id
  ON expeditions (route_id)
  WHERE route_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_code VARCHAR(40) NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  expedition_id UUID REFERENCES expeditions(id) ON DELETE RESTRICT,
  experience_id UUID REFERENCES experiences(id) ON DELETE RESTRICT,
  booking_type VARCHAR(24) NOT NULL
    CHECK (booking_type IN ('expedition', 'experience')),
  scheduled_date DATE NOT NULL,
  participants_count INTEGER NOT NULL DEFAULT 1 CHECK (participants_count >= 1),
  unit_price_kz NUMERIC(14, 2) NOT NULL CHECK (unit_price_kz >= 0),
  total_price_kz NUMERIC(14, 2) NOT NULL CHECK (total_price_kz >= 0),
  special_requests TEXT,
  status VARCHAR(24) NOT NULL DEFAULT 'confirmed'
    CHECK (status IN ('pending_payment', 'confirmed', 'checked_in', 'completed', 'cancelled', 'refunded')),
  payment_status VARCHAR(24) NOT NULL DEFAULT 'pending'
    CHECK (payment_status IN ('pending', 'paid', 'refunded', 'failed')),
  payment_method VARCHAR(32) NOT NULL DEFAULT 'wallet'
    CHECK (payment_method IN ('wallet', 'internal_demo', 'unitel_money', 'bank_transfer')),
  payment_transaction_id UUID,
  paid_at TIMESTAMPTZ,
  cancellation_reason TEXT,
  cancelled_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  cancelled_at TIMESTAMPTZ,
  idempotency_key VARCHAR(120),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_bookings_target CHECK (expedition_id IS NOT NULL OR experience_id IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_bookings_user_idempotency
  ON bookings (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bookings_user_created
  ON bookings (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_bookings_company_status
  ON bookings (company_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_bookings_expedition_status
  ON bookings (expedition_id, status)
  WHERE expedition_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS booking_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  full_name VARCHAR(140) NOT NULL,
  document_number VARCHAR(60),
  phone VARCHAR(40),
  emergency_contact VARCHAR(140),
  notes VARCHAR(400),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_booking_participants_booking_id
  ON booking_participants (booking_id);

CREATE TABLE IF NOT EXISTS expedition_waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expedition_id UUID NOT NULL REFERENCES expeditions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  participants_count INTEGER NOT NULL DEFAULT 1 CHECK (participants_count >= 1),
  position INTEGER NOT NULL CHECK (position >= 1),
  status VARCHAR(24) NOT NULL DEFAULT 'waiting'
    CHECK (status IN ('waiting', 'notified', 'confirmed', 'expired', 'cancelled')),
  notes TEXT,
  notified_at TIMESTAMPTZ,
  confirmation_deadline_at TIMESTAMPTZ,
  confirmed_booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_waitlist_active_user_expedition
  ON expedition_waitlist (expedition_id, user_id)
  WHERE status IN ('waiting', 'notified');

CREATE INDEX IF NOT EXISTS idx_waitlist_expedition_queue
  ON expedition_waitlist (expedition_id, status, position, created_at);

CREATE INDEX IF NOT EXISTS idx_waitlist_notified_deadline
  ON expedition_waitlist (confirmation_deadline_at)
  WHERE status = 'notified';