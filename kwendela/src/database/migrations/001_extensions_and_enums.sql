-- ============================================================================
-- 001_extensions_and_enums.sql
-- Extensões PostgreSQL/PostGIS, Tipos ENUM Canónicos e Funções Auxiliares
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS postgis;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'kwendela_user_role') THEN
    CREATE TYPE kwendela_user_role AS ENUM (
      'superadmin',
      'tourist',
      'company_owner',
      'company_admin',
      'company_staff',
      'guide'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'kwendela_account_status') THEN
    CREATE TYPE kwendela_account_status AS ENUM (
      'active',
      'suspended',
      'pending_verification'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'kwendela_company_status') THEN
    CREATE TYPE kwendela_company_status AS ENUM (
      'pending_verification',
      'active',
      'suspended',
      'rejected'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'kwendela_moderation_status') THEN
    CREATE TYPE kwendela_moderation_status AS ENUM (
      'pending_review',
      'approved',
      'rejected',
      'archived'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'kwendela_expedition_status') THEN
    CREATE TYPE kwendela_expedition_status AS ENUM (
      'draft',
      'published',
      'open',
      'full',
      'in_progress',
      'completed',
      'cancelled'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'kwendela_booking_status') THEN
    CREATE TYPE kwendela_booking_status AS ENUM (
      'pending_payment',
      'confirmed',
      'checked_in',
      'completed',
      'cancelled',
      'refunded'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'kwendela_waitlist_status') THEN
    CREATE TYPE kwendela_waitlist_status AS ENUM (
      'waiting',
      'notified',
      'confirmed',
      'expired',
      'cancelled'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'kwendela_wallet_tx_type') THEN
    CREATE TYPE kwendela_wallet_tx_type AS ENUM (
      'demo_topup',
      'transfer',
      'booking_payment',
      'booking_hold',
      'booking_release',
      'refund',
      'commission',
      'subscription_payment',
      'premium_payment',
      'qr_payment'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'kwendela_report_status') THEN
    CREATE TYPE kwendela_report_status AS ENUM (
      'open',
      'under_review',
      'resolved',
      'dismissed'
    );
  END IF;
END $$;

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;