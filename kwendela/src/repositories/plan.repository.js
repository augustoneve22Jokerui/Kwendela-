'use strict';

const { query } = require('../config/database');

function exec(client, text, params = []) {
  return client ? client.query(text, params) : query(text, params);
}

async function findAll({ includeInactive = false } = {}) {
  const whereClause = includeInactive ? '' : 'WHERE is_active = TRUE';
  const result = await query(
    `
    SELECT *
    FROM plans
    ${whereClause}
    ORDER BY display_order ASC, price_kz ASC
    `
  );
  return result.rows;
}

async function findById(planId) {
  const result = await query(
    `
    SELECT *
    FROM plans
    WHERE id = $1
    `,
    [planId]
  );
  return result.rows[0] || null;
}

async function findByCode(code) {
  const result = await query(
    `
    SELECT *
    FROM plans
    WHERE LOWER(code) = LOWER($1)
    LIMIT 1
    `,
    [code]
  );
  return result.rows[0] || null;
}

async function updatePlan(planId, payload) {
  const updates = [];
  const params = [planId];

  const scalarMap = {
    name: 'name',
    description: 'description',
    priceKz: 'price_kz',
    billingCycle: 'billing_cycle',
    maxUsers: 'max_users',
    maxExperiences: 'max_experiences',
    maxDestinations: 'max_destinations',
    isActive: 'is_active'
  };

  for (const [key, col] of Object.entries(scalarMap)) {
    if (payload[key] !== undefined) {
      params.push(payload[key]);
      updates.push(`${col} = $${params.length}`);
    }
  }

  if (payload.features !== undefined) {
    params.push(JSON.stringify(payload.features || {}));
    updates.push(`features = $${params.length}::jsonb`);
  }

  if (payload.limits !== undefined) {
    params.push(JSON.stringify(payload.limits || {}));
    updates.push(`limits = $${params.length}::jsonb`);
  }

  if (updates.length === 0) {
    return findById(planId);
  }

  updates.push('updated_at = NOW()');

  const result = await query(
    `
    UPDATE plans
    SET ${updates.join(', ')}
    WHERE id = $1
    RETURNING *
    `,
    params
  );
  return result.rows[0] || null;
}

async function findActiveSubscriptionWithPlan(companyId) {
  const result = await query(
    `
    SELECT
      cs.id AS sub_id,
      cs.company_id AS sub_company_id,
      cs.plan_id AS sub_plan_id,
      cs.status AS sub_status,
      cs.starts_at AS sub_starts_at,
      cs.ends_at AS sub_ends_at,
      cs.price_kz AS sub_price_kz,
      cs.auto_renew AS sub_auto_renew,
      cs.notes AS sub_notes,
      cs.created_at AS sub_created_at,
      p.*
    FROM company_subscriptions cs
    INNER JOIN plans p ON p.id = cs.plan_id
    WHERE cs.company_id = $1
      AND cs.status = 'active'
      AND (cs.ends_at IS NULL OR cs.ends_at > NOW())
    ORDER BY cs.created_at DESC
    LIMIT 1
    `,
    [companyId]
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  const subscription = {
    id: row.sub_id,
    company_id: row.sub_company_id,
    plan_id: row.sub_plan_id,
    status: row.sub_status,
    starts_at: row.sub_starts_at,
    ends_at: row.sub_ends_at,
    price_kz: row.sub_price_kz,
    auto_renew: row.sub_auto_renew,
    notes: row.sub_notes,
    created_at: row.sub_created_at
  };

  const plan = {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    price_kz: row.price_kz,
    billing_cycle: row.billing_cycle,
    max_users: row.max_users,
    max_experiences: row.max_experiences,
    max_destinations: row.max_destinations,
    features: row.features,
    limits: row.limits,
    is_active: row.is_active,
    display_order: row.display_order
  };

  return { subscription, plan };
}

async function countCompanyResourceUsage(companyId, resourceKey) {
  let sql = null;

  switch (resourceKey) {
    case 'users':
      sql = `
        SELECT COUNT(*)::INTEGER AS total
        FROM company_members
        WHERE company_id = $1 AND is_active = TRUE
      `;
      break;
    case 'experiences':
      sql = `
        SELECT COUNT(*)::INTEGER AS total
        FROM experiences
        WHERE company_id = $1 AND moderation_status <> 'archived'
      `;
      break;
    case 'destinations':
      sql = `
        SELECT COUNT(*)::INTEGER AS total
        FROM destinations
        WHERE company_id = $1 AND moderation_status <> 'archived'
      `;
      break;
    case 'expeditions':
      sql = `
        SELECT COUNT(*)::INTEGER AS total
        FROM expeditions
        WHERE company_id = $1 AND status IN ('draft', 'published', 'open', 'full', 'in_progress')
      `;
      break;
    default:
      return 0;
  }

  const result = await query(sql, [companyId]);
  return result.rows[0] ? result.rows[0].total : 0;
}

async function cancelActiveSubscriptions(companyId, client = null) {
  await exec(
    client,
    `
    UPDATE company_subscriptions
    SET status = 'cancelled',
        cancelled_at = NOW(),
        updated_at = NOW()
    WHERE company_id = $1 AND status = 'active'
    `,
    [companyId]
  );
}

async function createCompanySubscription(
  {
    companyId,
    planId,
    status = 'active',
    durationMonths = 1,
    priceKz,
    autoRenew = false,
    assignedByUserId = null,
    notes = null
  },
  client = null
) {
  const result = await exec(
    client,
    `
    INSERT INTO company_subscriptions (
      company_id,
      plan_id,
      status,
      starts_at,
      ends_at,
      price_kz,
      auto_renew,
      assigned_by_user_id,
      notes
    )
    VALUES (
      $1,
      $2,
      $3,
      NOW(),
      NOW() + make_interval(months => $4),
      $5,
      $6,
      $7,
      $8
    )
    RETURNING *
    `,
    [
      companyId,
      planId,
      status,
      Number(durationMonths),
      Number(priceKz),
      Boolean(autoRenew),
      assignedByUserId,
      notes
    ]
  );
  return result.rows[0];
}

async function findAllSubscriptions(filters = {}, pagination = { limit: 20, offset: 0 }) {
  const conditions = [];
  const params = [];

  if (filters.status) {
    params.push(filters.status);
    conditions.push(`cs.status = $${params.length}`);
  }

  if (filters.companyId) {
    params.push(filters.companyId);
    conditions.push(`cs.company_id = $${params.length}`);
  }

  if (filters.planId) {
    params.push(filters.planId);
    conditions.push(`cs.plan_id = $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await query(
    `SELECT COUNT(*)::INTEGER AS total FROM company_subscriptions cs ${whereClause}`,
    params
  );

  params.push(pagination.limit, pagination.offset);

  const listResult = await query(
    `
    SELECT
      cs.*,
      c.name AS company_name,
      c.email AS company_email,
      p.code AS plan_code,
      p.name AS plan_name
    FROM company_subscriptions cs
    INNER JOIN companies c ON c.id = cs.company_id
    INNER JOIN plans p ON p.id = cs.plan_id
    ${whereClause}
    ORDER BY cs.created_at DESC
    LIMIT $${params.length - 1} OFFSET $${params.length}
    `,
    params
  );

  return {
    items: listResult.rows,
    total: countResult.rows[0].total
  };
}

async function findCompanySubscriptionHistory(companyId) {
  const result = await query(
    `
    SELECT
      cs.*,
      p.code AS plan_code,
      p.name AS plan_name,
      p.billing_cycle
    FROM company_subscriptions cs
    INNER JOIN plans p ON p.id = cs.plan_id
    WHERE cs.company_id = $1
    ORDER BY cs.created_at DESC
    `,
    [companyId]
  );
  return result.rows;
}

module.exports = {
  findAll,
  findById,
  findByCode,
  updatePlan,
  findActiveSubscriptionWithPlan,
  countCompanyResourceUsage,
  cancelActiveSubscriptions,
  createCompanySubscription,
  findAllSubscriptions,
  findCompanySubscriptionHistory
};