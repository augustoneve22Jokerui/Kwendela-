'use strict';

const { query } = require('../config/database');

function exec(client, text, params = []) {
  return client ? client.query(text, params) : query(text, params);
}

async function createWallet(
  {
    ownerType,
    ownerUserId = null,
    ownerCompanyId = null,
    accountCode,
    currency = 'AOA'
  },
  client = null
) {
  const result = await exec(
    client,
    `
    INSERT INTO wallets (
      owner_type,
      owner_user_id,
      owner_company_id,
      account_code,
      currency,
      available_balance,
      reserved_balance
    )
    VALUES ($1, $2, $3, $4, $5, 0, 0)
    RETURNING *
    `,
    [ownerType, ownerUserId, ownerCompanyId, accountCode, currency]
  );
  return result.rows[0];
}

async function findByIdForUpdate(walletId, client) {
  const result = await client.query(
    `
    SELECT *
    FROM wallets
    WHERE id = $1
    FOR UPDATE
    `,
    [walletId]
  );
  return result.rows[0] || null;
}

async function findByUserId(userId, client = null) {
  const result = await exec(
    client,
    `
    SELECT *
    FROM wallets
    WHERE owner_user_id = $1 AND owner_type = 'user'
    LIMIT 1
    `,
    [userId]
  );
  return result.rows[0] || null;
}

async function findByCompanyId(companyId, client = null) {
  const result = await exec(
    client,
    `
    SELECT *
    FROM wallets
    WHERE owner_company_id = $1 AND owner_type = 'company'
    LIMIT 1
    `,
    [companyId]
  );
  return result.rows[0] || null;
}

async function findPlatformWallet(client = null) {
  const result = await exec(
    client,
    `
    SELECT *
    FROM wallets
    WHERE owner_type = 'platform'
    LIMIT 1
    `
  );
  return result.rows[0] || null;
}

async function findWalletByIdentifier(identifier) {
  const trimmed = String(identifier || '').trim();
  if (!trimmed) {
    return null;
  }

  const result = await query(
    `
    SELECT w.*
    FROM wallets w
    LEFT JOIN users u ON u.id = w.owner_user_id
    LEFT JOIN companies c ON c.id = w.owner_company_id
    WHERE UPPER(w.account_code) = UPPER($1)
       OR (w.owner_type = 'user' AND LOWER(u.email) = LOWER($1))
       OR (w.owner_type = 'company' AND LOWER(c.email) = LOWER($1))
    LIMIT 1
    `,
    [trimmed]
  );
  return result.rows[0] || null;
}

async function updateWalletBalances(
  walletId,
  { availableBalance = undefined, reservedBalance = undefined },
  client = null
) {
  const updates = [];
  const params = [walletId];

  if (availableBalance !== undefined) {
    params.push(Number(availableBalance));
    updates.push(`available_balance = $${params.length}`);
  }

  if (reservedBalance !== undefined) {
    params.push(Number(reservedBalance));
    updates.push(`reserved_balance = $${params.length}`);
  }

  if (updates.length === 0) {
    return null;
  }

  updates.push('updated_at = NOW()');

  const result = await exec(
    client,
    `
    UPDATE wallets
    SET ${updates.join(', ')}
    WHERE id = $1
    RETURNING *
    `,
    params
  );
  return result.rows[0] || null;
}

async function createTransaction(
  {
    referenceCode,
    transactionType,
    status = 'completed',
    sourceWalletId = null,
    destinationWalletId = null,
    amount,
    feeAmount = 0,
    currency = 'AOA',
    provider = 'internal_wallet',
    isDemo = false,
    idempotencyKey = null,
    referenceType = null,
    referenceId = null,
    description = null,
    initiatedByUserId = null,
    metadata = {}
  },
  client = null
) {
  const result = await exec(
    client,
    `
    INSERT INTO wallet_transactions (
      reference_code,
      transaction_type,
      status,
      source_wallet_id,
      destination_wallet_id,
      amount,
      fee_amount,
      currency,
      provider,
      is_demo,
      idempotency_key,
      reference_type,
      reference_id,
      description,
      initiated_by_user_id,
      metadata
    )
    VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::jsonb
    )
    RETURNING *
    `,
    [
      referenceCode,
      transactionType,
      status,
      sourceWalletId,
      destinationWalletId,
      Number(amount),
      Number(feeAmount || 0),
      currency,
      provider,
      Boolean(isDemo),
      idempotencyKey,
      referenceType,
      referenceId ? String(referenceId) : null,
      description,
      initiatedByUserId,
      JSON.stringify(metadata || {})
    ]
  );
  return result.rows[0];
}

async function findTransactionByIdempotencyKey(idempotencyKey) {
  const result = await query(
    `
    SELECT *
    FROM wallet_transactions
    WHERE idempotency_key = $1
    LIMIT 1
    `,
    [idempotencyKey]
  );
  return result.rows[0] || null;
}

async function createLedgerEntry(
  { transactionId, walletId, entryType, amount, balanceAfter, description = null },
  client = null
) {
  const result = await exec(
    client,
    `
    INSERT INTO wallet_ledger_entries (
      transaction_id,
      wallet_id,
      entry_type,
      amount,
      balance_after,
      description
    )
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *
    `,
    [
      transactionId,
      walletId,
      entryType,
      Number(amount),
      Number(balanceAfter),
      description
    ]
  );
  return result.rows[0];
}

async function findTransactionsByWalletId(
  walletId,
  filters = {},
  pagination = { limit: 20, offset: 0 }
) {
  const conditions = ['(wt.source_wallet_id = $1 OR wt.destination_wallet_id = $1)'];
  const params = [walletId];

  if (filters.type) {
    params.push(filters.type);
    conditions.push(`wt.transaction_type = $${params.length}`);
  }

  if (filters.status) {
    params.push(filters.status);
    conditions.push(`wt.status = $${params.length}`);
  }

  if (filters.startDate) {
    params.push(filters.startDate);
    conditions.push(`wt.created_at >= $${params.length}`);
  }

  if (filters.endDate) {
    params.push(filters.endDate);
    conditions.push(`wt.created_at <= $${params.length}`);
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;

  const countResult = await query(
    `SELECT COUNT(*)::INTEGER AS total FROM wallet_transactions wt ${whereClause}`,
    params
  );

  params.push(pagination.limit, pagination.offset);

  const listResult = await query(
    `
    SELECT
      wt.*,
      sw.account_code AS source_account_code,
      dw.account_code AS destination_account_code,
      CASE
        WHEN wt.destination_wallet_id = $1 THEN 'credit'
        ELSE 'debit'
      END AS direction
    FROM wallet_transactions wt
    LEFT JOIN wallets sw ON sw.id = wt.source_wallet_id
    LEFT JOIN wallets dw ON dw.id = wt.destination_wallet_id
    ${whereClause}
    ORDER BY wt.created_at DESC
    LIMIT $${params.length - 1} OFFSET $${params.length}
    `,
    params
  );

  return {
    items: listResult.rows,
    total: countResult.rows[0].total
  };
}

async function createQrCode({
  walletId,
  createdByUserId,
  token,
  amount = null,
  description = null,
  signedPayload,
  expiresAt
}) {
  const result = await query(
    `
    INSERT INTO wallet_qr_codes (
      wallet_id,
      created_by_user_id,
      token,
      amount,
      description,
      signed_payload,
      expires_at,
      status
    )
    VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, 'active')
    RETURNING *
    `,
    [
      walletId,
      createdByUserId,
      token,
      amount !== null && amount !== undefined ? Number(amount) : null,
      description,
      JSON.stringify(signedPayload),
      expiresAt
    ]
  );
  return result.rows[0];
}

async function findQrByToken(token) {
  const result = await query(
    `
    SELECT *
    FROM wallet_qr_codes
    WHERE token = $1
    LIMIT 1
    `,
    [token]
  );
  return result.rows[0] || null;
}

async function findQrByIdForUpdate(qrId, client) {
  const result = await client.query(
    `
    SELECT *
    FROM wallet_qr_codes
    WHERE id = $1
    FOR UPDATE
    `,
    [qrId]
  );
  return result.rows[0] || null;
}

async function markQrUsed(qrId, transactionId, client = null) {
  const result = await exec(
    client,
    `
    UPDATE wallet_qr_codes
    SET status = 'used',
        used_transaction_id = $2,
        used_at = NOW(),
        updated_at = NOW()
    WHERE id = $1
    RETURNING *
    `,
    [qrId, transactionId]
  );
  return result.rows[0] || null;
}

async function reconcileWalletBalance(walletId) {
  const result = await query(
    `
    SELECT
      w.available_balance::NUMERIC(14,2) AS wallet_balance,
      COALESCE(
        SUM(
          CASE
            WHEN wle.entry_type = 'credit' THEN wle.amount
            WHEN wle.entry_type = 'debit' THEN -wle.amount
            ELSE 0
          END
        ),
        0
      )::NUMERIC(14,2) AS ledger_balance
    FROM wallets w
    LEFT JOIN wallet_ledger_entries wle ON wle.wallet_id = w.id
    WHERE w.id = $1
    GROUP BY w.id, w.available_balance
    `,
    [walletId]
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  const walletBalance = Number(row.wallet_balance);
  const ledgerBalance = Number(row.ledger_balance);
  const discrepancy = Number((walletBalance - ledgerBalance).toFixed(2));

  return {
    walletBalance,
    ledgerBalance,
    discrepancy,
    isReconciled: discrepancy === 0
  };
}

module.exports = {
  createWallet,
  findByIdForUpdate,
  findByUserId,
  findByCompanyId,
  findPlatformWallet,
  findWalletByIdentifier,
  updateWalletBalances,
  createTransaction,
  findTransactionByIdempotencyKey,
  createLedgerEntry,
  findTransactionsByWalletId,
  createQrCode,
  findQrByToken,
  findQrByIdForUpdate,
  markQrUsed,
  reconcileWalletBalance
};