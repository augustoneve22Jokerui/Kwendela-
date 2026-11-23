'use strict';

const { query, withTransaction } = require('../config/database');

async function getOverviewMetrics() {
  const [
    usersResult,
    companiesResult,
    destinationsResult,
    experiencesResult,
    expeditionsResult,
    bookingsResult,
    revenueResult,
    reportsResult,
    planBreakdownResult,
    recentAuditResult
  ] = await Promise.all([
    query(`
      SELECT
        COUNT(*)::INTEGER AS total_users,
        COUNT(*) FILTER (WHERE role = 'tourist')::INTEGER AS total_tourists,
        COUNT(*) FILTER (WHERE is_premium = TRUE AND (premium_expires_at IS NULL OR premium_expires_at > NOW()))::INTEGER AS premium_tourists,
        COUNT(*) FILTER (WHERE status = 'suspended')::INTEGER AS suspended_users
      FROM users
    `),
    query(`
      SELECT
        COUNT(*)::INTEGER AS total_companies,
        COUNT(*) FILTER (WHERE status = 'active')::INTEGER AS active_companies,
        COUNT(*) FILTER (WHERE status = 'pending_verification')::INTEGER AS pending_companies,
        COUNT(*) FILTER (WHERE status = 'suspended')::INTEGER AS suspended_companies
      FROM companies
    `),
    query(`
      SELECT
        COUNT(*)::INTEGER AS total_destinations,
        COUNT(*) FILTER (WHERE moderation_status = 'approved')::INTEGER AS approved_destinations,
        COUNT(*) FILTER (WHERE moderation_status = 'pending_review')::INTEGER AS pending_destinations
      FROM destinations
      WHERE moderation_status <> 'archived'
    `),
    query(`
      SELECT
        COUNT(*)::INTEGER AS total_experiences,
        COUNT(*) FILTER (WHERE moderation_status = 'approved')::INTEGER AS approved_experiences,
        COUNT(*) FILTER (WHERE moderation_status = 'pending_review')::INTEGER AS pending_experiences
      FROM experiences
      WHERE moderation_status <> 'archived'
    `),
    query(`
      SELECT
        COUNT(*)::INTEGER AS total_expeditions,
        COUNT(*) FILTER (WHERE status IN ('published', 'open', 'in_progress'))::INTEGER AS active_expeditions
      FROM expeditions
    `),
    query(`
      SELECT
        COUNT(*)::INTEGER AS total_bookings,
        COUNT(*) FILTER (WHERE status IN ('confirmed', 'checked_in', 'completed'))::INTEGER AS confirmed_bookings,
        COALESCE(SUM(total_price_kz) FILTER (WHERE payment_status = 'paid'), 0)::NUMERIC(14,2) AS gross_booking_volume_kz
      FROM bookings
    `),
    query(`
      SELECT
        COALESCE(SUM(amount) FILTER (WHERE transaction_type = 'booking_payment' AND status = 'completed'), 0)::NUMERIC(14,2) AS booking_volume_kz,
        COALESCE(SUM(fee_amount) FILTER (WHERE transaction_type = 'booking_payment' AND status = 'completed'), 0)::NUMERIC(14,2) AS platform_commissions_kz,
        COALESCE(SUM(amount) FILTER (WHERE transaction_type = 'subscription_payment' AND status = 'completed'), 0)::NUMERIC(14,2) AS subscription_revenue_kz,
        COALESCE(SUM(amount) FILTER (WHERE transaction_type = 'premium_payment' AND status = 'completed'), 0)::NUMERIC(14,2) AS premium_revenue_kz
      FROM wallet_transactions
    `),
    query(`
      SELECT
        COUNT(*) FILTER (WHERE status IN ('open', 'under_review'))::INTEGER AS open_reports
      FROM reports
    `),
    query(`
      SELECT
        p.id,
        p.code,
        p.name,
        p.price_kz,
        COUNT(cs.id) FILTER (WHERE cs.status = 'active')::INTEGER AS active_subscriptions
      FROM plans p
      LEFT JOIN company_subscriptions cs ON cs.plan_id = p.id
      GROUP BY p.id
      ORDER BY p.display_order ASC, p.price_kz ASC
    `),
    query(`
      SELECT
        al.id,
        al.action,
        al.entity_type,
        al.entity_id,
        al.created_at,
        u.full_name AS actor_name,
        u.email AS actor_email
      FROM audit_logs al
      LEFT JOIN users u ON u.id = al.actor_user_id
      ORDER BY al.created_at DESC
      LIMIT 10
    `)
  ]);

  return {
    users: usersResult.rows[0],
    companies: companiesResult.rows[0],
    destinations: destinationsResult.rows[0],
    experiences: experiencesResult.rows[0],
    expeditions: expeditionsResult.rows[0],
    bookings: bookingsResult.rows[0],
    revenue: revenueResult.rows[0],
    reports: reportsResult.rows[0],
    planBreakdown: planBreakdownResult.rows,
    recentAuditLogs: recentAuditResult.rows
  };
}

async function findAllFinancialOperations(filters = {}, pagination = { limit: 20, offset: 0 }) {
  const conditions = [];
  const params = [];

  if (filters.type) {
    params.push(filters.type);
    conditions.push(`wt.transaction_type = $${params.length}`);
  }

  if (filters.status) {
    params.push(filters.status);
    conditions.push(`wt.status = $${params.length}`);
  }

  if (filters.isDemo !== undefined && filters.isDemo !== '') {
    params.push(String(filters.isDemo) === 'true');
    conditions.push(`wt.is_demo = $${params.length}`);
  }

  if (filters.search) {
    params.push(`%${filters.search}%`);
    conditions.push(`(wt.reference_code ILIKE $${params.length} OR wt.description ILIKE $${params.length})`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

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
      u.full_name AS initiated_by_name,
      u.email AS initiated_by_email
    FROM wallet_transactions wt
    LEFT JOIN wallets sw ON sw.id = wt.source_wallet_id
    LEFT JOIN wallets dw ON dw.id = wt.destination_wallet_id
    LEFT JOIN users u ON u.id = wt.initiated_by_user_id
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

async function findDestinationsForModeration(filters = {}, pagination = { limit: 20, offset: 0 }) {
  const conditions = [];
  const params = [];

  if (filters.moderationStatus) {
    params.push(filters.moderationStatus);
    conditions.push(`d.moderation_status = $${params.length}`);
  }

  if (filters.province) {
    params.push(filters.province);
    conditions.push(`d.province ILIKE $${params.length}`);
  }

  if (filters.search) {
    params.push(`%${filters.search}%`);
    conditions.push(`(d.name ILIKE $${params.length} OR d.province ILIKE $${params.length})`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await query(
    `SELECT COUNT(*)::INTEGER AS total FROM destinations d ${whereClause}`,
    params
  );

  params.push(pagination.limit, pagination.offset);

  const listResult = await query(
    `
    SELECT
      d.*,
      c.name AS company_name,
      u.full_name AS created_by_name
    FROM destinations d
    LEFT JOIN companies c ON c.id = d.company_id
    LEFT JOIN users u ON u.id = d.created_by_user_id
    ${whereClause}
    ORDER BY
      CASE WHEN d.moderation_status = 'pending_review' THEN 0 ELSE 1 END,
      d.created_at DESC
    LIMIT $${params.length - 1} OFFSET $${params.length}
    `,
    params
  );

  return {
    items: listResult.rows,
    total: countResult.rows[0].total
  };
}

async function updateDestinationModeration(
  destinationId,
  { moderationStatus, moderationNotes = null, moderatedByUserId }
) {
  const result = await query(
    `
    UPDATE destinations
    SET moderation_status = $2,
        moderation_notes = $3,
        moderated_by_user_id = $4,
        moderated_at = NOW(),
        updated_at = NOW()
    WHERE id = $1
    RETURNING *
    `,
    [destinationId, moderationStatus, moderationNotes, moderatedByUserId]
  );
  return result.rows[0] || null;
}

async function findExperiencesForModeration(filters = {}, pagination = { limit: 20, offset: 0 }) {
  const conditions = [];
  const params = [];

  if (filters.moderationStatus) {
    params.push(filters.moderationStatus);
    conditions.push(`e.moderation_status = $${params.length}`);
  }

  if (filters.category) {
    params.push(filters.category);
    conditions.push(`e.category = $${params.length}`);
  }

  if (filters.search) {
    params.push(`%${filters.search}%`);
    conditions.push(`(e.title ILIKE $${params.length} OR c.name ILIKE $${params.length})`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await query(
    `
    SELECT COUNT(*)::INTEGER AS total
    FROM experiences e
    LEFT JOIN companies c ON c.id = e.company_id
    ${whereClause}
    `,
    params
  );

  params.push(pagination.limit, pagination.offset);

  const listResult = await query(
    `
    SELECT
      e.*,
      c.name AS company_name,
      d.name AS destination_name,
      d.province AS destination_province
    FROM experiences e
    LEFT JOIN companies c ON c.id = e.company_id
    LEFT JOIN destinations d ON d.id = e.destination_id
    ${whereClause}
    ORDER BY
      CASE WHEN e.moderation_status = 'pending_review' THEN 0 ELSE 1 END,
      e.created_at DESC
    LIMIT $${params.length - 1} OFFSET $${params.length}
    `,
    params
  );

  return {
    items: listResult.rows,
    total: countResult.rows[0].total
  };
}

async function updateExperienceModeration(
  experienceId,
  { moderationStatus, moderationNotes = null, moderatedByUserId }
) {
  const result = await query(
    `
    UPDATE experiences
    SET moderation_status = $2,
        moderation_notes = $3,
        moderated_by_user_id = $4,
        moderated_at = NOW(),
        updated_at = NOW()
    WHERE id = $1
    RETURNING *
    `,
    [experienceId, moderationStatus, moderationNotes, moderatedByUserId]
  );
  return result.rows[0] || null;
}

async function findAllBookings(filters = {}, pagination = { limit: 20, offset: 0 }) {
  const conditions = [];
  const params = [];

  if (filters.status) {
    params.push(filters.status);
    conditions.push(`b.status = $${params.length}`);
  }

  if (filters.companyId) {
    params.push(filters.companyId);
    conditions.push(`b.company_id = $${params.length}`);
  }

  if (filters.search) {
    params.push(`%${filters.search}%`);
    conditions.push(`(b.reference_code ILIKE $${params.length} OR u.full_name ILIKE $${params.length} OR c.name ILIKE $${params.length})`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await query(
    `
    SELECT COUNT(*)::INTEGER AS total
    FROM bookings b
    LEFT JOIN users u ON u.id = b.user_id
    LEFT JOIN companies c ON c.id = b.company_id
    ${whereClause}
    `,
    params
  );

  params.push(pagination.limit, pagination.offset);

  const listResult = await query(
    `
    SELECT
      b.*,
      u.full_name AS tourist_name,
      u.email AS tourist_email,
      c.name AS company_name,
      exp.title AS experience_title,
      exd.title AS expedition_title
    FROM bookings b
    INNER JOIN users u ON u.id = b.user_id
    INNER JOIN companies c ON c.id = b.company_id
    LEFT JOIN experiences exp ON exp.id = b.experience_id
    LEFT JOIN expeditions exd ON exd.id = b.expedition_id
    ${whereClause}
    ORDER BY b.created_at DESC
    LIMIT $${params.length - 1} OFFSET $${params.length}
    `,
    params
  );

  return {
    items: listResult.rows,
    total: countResult.rows[0].total
  };
}

async function findAllReports(filters = {}, pagination = { limit: 20, offset: 0 }) {
  const conditions = [];
  const params = [];

  if (filters.status) {
    params.push(filters.status);
    conditions.push(`r.status = $${params.length}`);
  }

  if (filters.targetType) {
    params.push(filters.targetType);
    conditions.push(`r.target_type = $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await query(
    `SELECT COUNT(*)::INTEGER AS total FROM reports r ${whereClause}`,
    params
  );

  params.push(pagination.limit, pagination.offset);

  const listResult = await query(
    `
    SELECT
      r.*,
      reporter.full_name AS reporter_name,
      reporter.email AS reporter_email,
      resolver.full_name AS resolved_by_name
    FROM reports r
    INNER JOIN users reporter ON reporter.id = r.reporter_user_id
    LEFT JOIN users resolver ON resolver.id = r.resolved_by_user_id
    ${whereClause}
    ORDER BY
      CASE WHEN r.status IN ('open', 'under_review') THEN 0 ELSE 1 END,
      r.created_at DESC
    LIMIT $${params.length - 1} OFFSET $${params.length}
    `,
    params
  );

  return {
    items: listResult.rows,
    total: countResult.rows[0].total
  };
}

async function updateReportStatus(reportId, { status, resolutionNotes, resolvedByUserId }) {
  const result = await query(
    `
    UPDATE reports
    SET status = $2,
        resolution_notes = $3,
        resolved_by_user_id = $4,
        resolved_at = NOW(),
        updated_at = NOW()
    WHERE id = $1
    RETURNING *
    `,
    [reportId, status, resolutionNotes, resolvedByUserId]
  );
  return result.rows[0] || null;
}

async function findAuditLogs(filters = {}, pagination = { limit: 30, offset: 0 }) {
  const conditions = [];
  const params = [];

  if (filters.action) {
    params.push(`%${filters.action}%`);
    conditions.push(`al.action ILIKE $${params.length}`);
  }

  if (filters.entityType) {
    params.push(filters.entityType);
    conditions.push(`al.entity_type = $${params.length}`);
  }

  if (filters.actorUserId) {
    params.push(filters.actorUserId);
    conditions.push(`al.actor_user_id = $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await query(
    `SELECT COUNT(*)::INTEGER AS total FROM audit_logs al ${whereClause}`,
    params
  );

  params.push(pagination.limit, pagination.offset);

  const listResult = await query(
    `
    SELECT
      al.*,
      u.full_name AS actor_name,
      u.email AS actor_email,
      c.name AS company_name
    FROM audit_logs al
    LEFT JOIN users u ON u.id = al.actor_user_id
    LEFT JOIN companies c ON c.id = al.company_id
    ${whereClause}
    ORDER BY al.created_at DESC
    LIMIT $${params.length - 1} OFFSET $${params.length}
    `,
    params
  );

  return {
    items: listResult.rows,
    total: countResult.rows[0].total
  };
}

async function findAllGlobalSettings() {
  const result = await query(
    `
    SELECT gs.*, u.full_name AS updated_by_name
    FROM global_settings gs
    LEFT JOIN users u ON u.id = gs.updated_by_user_id
    ORDER BY gs.setting_key ASC
    `
  );
  return result.rows;
}

async function upsertGlobalSettings(settingsList = [], updatedByUserId = null) {
  return withTransaction(async (client) => {
    const updatedRows = [];

    for (const item of settingsList) {
      const result = await client.query(
        `
        INSERT INTO global_settings (setting_key, setting_value, description, updated_by_user_id)
        VALUES ($1, $2::jsonb, $3, $4)
        ON CONFLICT (setting_key) DO UPDATE
        SET setting_value = EXCLUDED.setting_value,
            description = COALESCE(EXCLUDED.description, global_settings.description),
            updated_by_user_id = EXCLUDED.updated_by_user_id,
            updated_at = NOW()
        RETURNING *
        `,
        [
          item.key,
          JSON.stringify(item.value),
          item.description || null,
          updatedByUserId
        ]
      );
      updatedRows.push(result.rows[0]);
    }

    return updatedRows;
  });
}

module.exports = {
  getOverviewMetrics,
  findAllFinancialOperations,
  findDestinationsForModeration,
  updateDestinationModeration,
  findExperiencesForModeration,
  updateExperienceModeration,
  findAllBookings,
  findAllReports,
  updateReportStatus,
  findAuditLogs,
  findAllGlobalSettings,
  upsertGlobalSettings
};