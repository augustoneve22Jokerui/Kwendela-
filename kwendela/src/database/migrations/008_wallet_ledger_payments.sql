-- ============================================================================
-- 008_wallet_ledger_payments.sql
-- Carteira KWENDELA, Transações Idempotentes, Ledger Imutável e QR Codes
-- ============================================================================

CREATE TABLE IF NOT EXISTS wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type VARCHAR(20) NOT NULL
    CHECK (owner_type IN ('user', 'company', 'platform')),
  owner_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  owner_company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  account_code VARCHAR(32) NOT NULL UNIQUE,
  currency VARCHAR(10) NOT NULL DEFAULT 'AOA',
  available_balance NUMERIC(14, 2) NOT NULL DEFAULT 0.00 CHECK (available_balance >= 0),
  reserved_balance NUMERIC(14, 2) NOT NULL DEFAULT 0.00 CHECK (reserved_balance >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_wallets_owner_consistency CHECK (
    (owner_type = 'user' AND owner_user_id IS NOT NULL AND owner_company_id IS NULL) OR
    (owner_type = 'company' AND owner_company_id IS NOT NULL AND owner_user_id IS NULL) OR
    (owner_type = 'platform' AND owner_user_id IS NULL AND owner_company_id IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_wallets_user
  ON wallets (owner_user_id)
  WHERE owner_type = 'user';

CREATE UNIQUE INDEX IF NOT EXISTS uq_wallets_company
  ON wallets (owner_company_id)
  WHERE owner_type = 'company';

CREATE UNIQUE INDEX IF NOT EXISTS uq_wallets_platform
  ON wallets (owner_type)
  WHERE owner_type = 'platform';

CREATE TABLE IF NOT EXISTS wallet_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_code VARCHAR(40) NOT NULL UNIQUE,
  transaction_type VARCHAR(32) NOT NULL
    CHECK (
      transaction_type IN (
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
      )
    ),
  status VARCHAR(24) NOT NULL DEFAULT 'completed'
    CHECK (status IN ('pending', 'completed', 'failed', 'reversed')),
  source_wallet_id UUID REFERENCES wallets(id) ON DELETE RESTRICT,
  destination_wallet_id UUID REFERENCES wallets(id) ON DELETE RESTRICT,
  amount NUMERIC(14, 2) NOT NULL CHECK (amount >= 0),
  fee_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00 CHECK (fee_amount >= 0),
  currency VARCHAR(10) NOT NULL DEFAULT 'AOA',
  provider VARCHAR(40) NOT NULL DEFAULT 'internal_wallet',
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  idempotency_key VARCHAR(160),
  reference_type VARCHAR(60),
  reference_id VARCHAR(120),
  description TEXT,
  initiated_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_wallet_tx_idempotency
  ON wallet_transactions (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_wallet_tx_source_created
  ON wallet_transactions (source_wallet_id, created_at DESC)
  WHERE source_wallet_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_wallet_tx_dest_created
  ON wallet_transactions (destination_wallet_id, created_at DESC)
  WHERE destination_wallet_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_wallet_tx_type_status
  ON wallet_transactions (transaction_type, status, created_at DESC);

CREATE TABLE IF NOT EXISTS wallet_ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES wallet_transactions(id) ON DELETE RESTRICT,
  wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE RESTRICT,
  entry_type VARCHAR(16) NOT NULL CHECK (entry_type IN ('credit', 'debit')),
  amount NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  balance_after NUMERIC(14, 2) NOT NULL CHECK (balance_after >= 0),
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wallet_ledger_wallet_created
  ON wallet_ledger_entries (wallet_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wallet_ledger_tx
  ON wallet_ledger_entries (transaction_id);

CREATE OR REPLACE FUNCTION prevent_wallet_ledger_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'O ledger financeiro KWENDELA (wallet_ledger_entries) é imutável e não permite alterações nem remoções.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_wallet_ledger_immutable ON wallet_ledger_entries;
CREATE TRIGGER trg_wallet_ledger_immutable
  BEFORE UPDATE OR DELETE ON wallet_ledger_entries
  FOR EACH ROW
  EXECUTE FUNCTION prevent_wallet_ledger_mutation();

CREATE TABLE IF NOT EXISTS wallet_qr_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token VARCHAR(128) NOT NULL UNIQUE,
  amount NUMERIC(14, 2) CHECK (amount IS NULL OR amount > 0),
  description VARCHAR(160),
  signed_payload JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'used', 'expired', 'cancelled')),
  used_transaction_id UUID REFERENCES wallet_transactions(id) ON DELETE SET NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wallet_qr_wallet_status
  ON wallet_qr_codes (wallet_id, status, expires_at);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_bookings_payment_tx'
      AND table_name = 'bookings'
  ) THEN
    ALTER TABLE bookings
      ADD CONSTRAINT fk_bookings_payment_tx
      FOREIGN KEY (payment_transaction_id) REFERENCES wallet_transactions(id) ON DELETE SET NULL;
  END IF;
END $$;