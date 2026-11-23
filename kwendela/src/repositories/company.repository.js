'use strict';

const { query } = require('../config/database');

function exec(client, text, params = []) {
  return client ? client.query(text, params) : query(text, params);
}

async function findById(companyId, client = null) {
  const result = await exec(
    client,
    `
    SELECT *
    FROM companies
    WHERE id = $1
    `,
    [companyId]
  );
  return result.rows[0] || null;
}

async function findDetailedById(companyId) {
  const result = await query(
    `
    SELECT
      c.*,
      u.full_name AS owner_name,
      u.email AS owner_email,
      u.phone AS owner_phone,
      p.id AS active_plan_id,
      p.code AS active_plan_code,
      p.name AS active_plan_name,
      cs.status AS subscription_status,
      cs.ends_at AS subscription_ends_at,
      w.account_code AS wallet_account_code,
      w.available_balance AS wallet_available_balance,
      (SELECT COUNT(*)::INTEGER FROM company_members cm WHERE cm.company_id = c.id AND cm.is_active = TRUE) AS team_count,
      (SELECT COUNT(*)::INTEGER FROM experiences e WHERE e.company_id = c.id AND e.moderation_status <> 'archived') AS experiences_count,
      (SELECT COUNT(*)::INTEGER FROM expeditions ex WHERE ex.company_id = c.id) AS expeditions_count
    FROM companies c
    LEFT JOIN users u ON u.id = c.owner_user_id
    LEFT JOIN company_subscriptions cs ON cs.company_id = c.id AND cs.status = 'active'
    LEFT JOIN plans p ON p.id = cs.plan_id
    LEFT JOIN wallets w ON w.owner_company_id = c.id AND w.owner_type = 'company'
    WHERE c.id = $1
    LIMIT 1
    `,
    [companyId]
  );
  return result.rows[0] || null;
}

async function findAllAdmin(filters = {}, pagination = { limit: 20, offset: 0 }) {
  const conditions = [];
  const params = [];

  if (filters.status) {
    params.push(filters.status);
    conditions.push(`c.status = $${params.length}`);
  }

  if (filters.province) {
    params.push(filters.province);
    conditions.push(`c.province ILIKE $${params.length}`);
  }

  if (filters.search) {
    params.push(`%${filters.search}%`);
    conditions.push(
      `(c.name ILIKE $${params.length} OR c.email ILIKE $${params.length} OR c.tax_id ILIKE $${params.length})`
    );
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await query(
    `SELECT COUNT(*)::INTEGER AS total FROM companies c ${whereClause}`,
    params
  );

  params.push(pagination.limit, pagination.offset);

  const listResult = await query(
    `
    SELECT
      c.*,
      u.full_name AS owner_name,
      u.email AS owner_email,
      p.name AS active_plan_name,
      p.code AS active_plan_code,
      cs.status AS subscription_status,
      cs.ends_at AS subscription_ends_at
    FROM companies c
    LEFT JOIN users u ON u.id = c.owner_user_id
    LEFT JOIN LATERAL (
      SELECT *
      FROM company_subscriptions
      WHERE company_id = c.id
      ORDER BY created_at DESC
      LIMIT 1
    ) cs ON TRUE
    LEFT JOIN plans p ON p.id = cs.plan_id
    ${whereClause}
    ORDER BY c.created_at DESC
    LIMIT $${params.length - 1} OFFSET $${params.length}
    `,
    params
  );

  return {
    items: listResult.rows,
    total: countResult.rows[0].total
  };
}

async function createCompany(
  {
    ownerUserId,
    name,
    slug,
    legalName = null,
    taxId = null,
    email,
    phone,
    province,
    city,
    address = null,
    description = null,
    status = 'active',
    isVerified = false
  },
  client = null
) {
  const result = await exec(
    client,
    `
    INSERT INTO companies (
      owner_user_id,
      name,
      slug,
      legal_name,
      tax_id,
      email,
      phone,
      province,
      city,
      address,
      description,
      status,
      is_verified
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    RETURNING *
    `,
    [
      ownerUserId,
      name,
      slug,
      legalName,
      taxId,
      email,
      phone,
      province,
      city,
      address,
      description,
      status,
      Boolean(isVerified)
    ]
  );
  return result.rows[0];
}

async function updateCompany(companyId, payload) {
  const fieldMap = {
    name: 'name',
    legalName: 'legal_name',
    taxId: 'tax_id',
    email: 'email',
    phone: 'phone',
    website: 'website',
    description: 'description',
    province: 'province',
    city: 'city',
    address: 'address'
  };

  const updates = [];
  const params = [companyId];

  for (const [key, column] of Object.entries(fieldMap)) {
    if (payload[key] !== undefined) {
      params.push(payload[key]);
      updates.push(`${column} = $${params.length}`);
    }
  }

  if (payload.socialLinks !== undefined) {
    params.push(JSON.stringify(payload.socialLinks || {}));
    updates.push(`social_links = $${params.length}::jsonb`);
  }

  if (updates.length === 0) {
    return findById(companyId);
  }

  updates.push('updated_at = NOW()');

  const result = await query(
    `
    UPDATE companies
    SET ${updates.join(', ')}
    WHERE id = $1
    RETURNING *
    `,
    params
  );
  return result.rows[0] || null;
}

async function updateCompanyMedia(companyId, { logoUrl = null, coverUrl = null }) {
  const result = await query(
    `
    UPDATE companies
    SET logo_url = COALESCE($2, logo_url),
        cover_url = COALESCE($3, cover_url),
        updated_at = NOW()
    WHERE id = $1
    RETURNING *
    `,
    [companyId, logoUrl, coverUrl]
  );
  return result.rows[0] || null;
}

async function updateStatus(companyId, { status, isVerified }) {
  const result = await query(
    `
    UPDATE companies
    SET status = $2,
        is_verified = $3,
        updated_at = NOW()
    WHERE id = $1
    RETURNING *
    `,
    [companyId, status, Boolean(isVerified)]
  );
  return result.rows[0] || null;
}

async function findMembership(companyId, userId, client = null) {
  const result = await exec(
    client,
    `
    SELECT *
    FROM company_members
    WHERE company_id = $1 AND user_id = $2
    LIMIT 1
    `,
    [companyId, userId]
  );
  return result.rows[0] || null;
}

async function findMembershipById(companyId, memberId) {
  const result = await query(
    `
    SELECT *
    FROM company_members
    WHERE company_id = $1 AND id = $2
    LIMIT 1
    `,
    [companyId, memberId]
  );
  return result.rows[0] || null;
}

async function addMember({ companyId, userId, role = 'staff', isActive = true }, client = null) {
  const result = await exec(
    client,
    `
    INSERT INTO company_members (company_id, user_id, role, is_active)
    VALUES ($1, $2, $3, $4)
    RETURNING *
    `,
    [companyId, userId, role, Boolean(isActive)]
  );
  return result.rows[0];
}

async function findTeamMembers(companyId) {
  const result = await query(
    `
    SELECT
      cm.id,
      cm.company_id,
      cm.user_id,
      cm.role AS company_role,
      cm.is_active,
      cm.created_at,
      u.full_name,
      u.email,
      u.phone,
      u.role AS user_role,
      u.status AS user_status,
      u.last_login_at
    FROM company_members cm
    INNER JOIN users u ON u.id = cm.user_id
    WHERE cm.company_id = $1
    ORDER BY
      CASE WHEN cm.role = 'owner' THEN 0 ELSE 1 END,
      cm.created_at ASC
    `,
    [companyId]
  );
  return result.rows;
}

async function updateMember(companyId, memberId, payload) {
  const updates = [];
  const params = [companyId, memberId];

  if (payload.companyRole !== undefined) {
    params.push(payload.companyRole);
    updates.push(`role = $${params.length}`);
  }

  if (payload.isActive !== undefined) {
    params.push(Boolean(payload.isActive));
    updates.push(`is_active = $${params.length}`);
  }

  if (updates.length === 0) {
    return findMembershipById(companyId, memberId);
  }

  updates.push('updated_at = NOW()');

  const result = await query(
    `
    UPDATE company_members
    SET ${updates.join(', ')}
    WHERE company_id = $1 AND id = $2
    RETURNING *
    `,
    params
  );
  return result.rows[0] || null;
}

async function findAdminUserIds(companyId) {
  const result = await query(
    `
    SELECT DISTINCT user_id
    FROM company_members
    WHERE company_id = $1
      AND is_active = TRUE
      AND role IN ('owner', 'admin')
    `,
    [companyId]
  );
  return result.rows.map((r) => r.user_id);
}

async function findGuides(companyId) {
  const result = await query(
    `
    SELECT *
    FROM guides
    WHERE company_id = $1
    ORDER BY is_active DESC, full_name ASC
    `,
    [companyId]
  );
  return result.rows;
}

async function findGuideById(companyId, guideId) {
  const result = await query(
    `
    SELECT *
    FROM guides
    WHERE company_id = $1 AND id = $2
    `,
    [companyId, guideId]
  );
  return result.rows[0] || null;
}

async function createGuide(companyId, payload) {
  const result = await query(
    `
    INSERT INTO guides (
      company_id,
      user_id,
      full_name,
      email,
      phone,
      languages,
      specialties,
      license_number,
      bio
    )
    VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9)
    RETURNING *
    `,
    [
      companyId,
      payload.userId || null,
      payload.fullName,
      payload.email || null,
      payload.phone,
      JSON.stringify(payload.languages || ['Português']),
      JSON.stringify(payload.specialties || []),
      payload.licenseNumber || null,
      payload.bio || null
    ]
  );
  return result.rows[0];
}

async function updateGuide(companyId, guideId, payload) {
  const updates = [];
  const params = [companyId, guideId];

  const scalarMap = {
    fullName: 'full_name',
    email: 'email',
    phone: 'phone',
    licenseNumber: 'license_number',
    bio: 'bio',
    isActive: 'is_active'
  };

  for (const [key, col] of Object.entries(scalarMap)) {
    if (payload[key] !== undefined) {
      params.push(payload[key]);
      updates.push(`${col} = $${params.length}`);
    }
  }

  if (payload.languages !== undefined) {
    params.push(JSON.stringify(payload.languages));
    updates.push(`languages = $${params.length}::jsonb`);
  }

  if (payload.specialties !== undefined) {
    params.push(JSON.stringify(payload.specialties));
    updates.push(`specialties = $${params.length}::jsonb`);
  }

  if (updates.length === 0) {
    return findGuideById(companyId, guideId);
  }

  updates.push('updated_at = NOW()');

  const result = await query(
    `
    UPDATE guides
    SET ${updates.join(', ')}
    WHERE company_id = $1 AND id = $2
    RETURNING *
    `,
    params
  );
  return result.rows[0] || null;
}

async function findTransports(companyId) {
  const result = await query(
    `
    SELECT *
    FROM transports
    WHERE company_id = $1
    ORDER BY is_active DESC, name ASC
    `,
    [companyId]
  );
  return result.rows;
}

async function findTransportById(companyId, transportId) {
  const result = await query(
    `
    SELECT *
    FROM transports
    WHERE company_id = $1 AND id = $2
    `,
    [companyId, transportId]
  );
  return result.rows[0] || null;
}

async function createTransport(companyId, payload) {
  const result = await query(
    `
    INSERT INTO transports (
      company_id,
      name,
      vehicle_type,
      plate_number,
      capacity,
      has_ac,
      features,
      notes
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
    RETURNING *
    `,
    [
      companyId,
      payload.name,
      payload.vehicleType,
      payload.plateNumber || null,
      Number(payload.capacity),
      payload.hasAc !== undefined ? Boolean(payload.hasAc) : true,
      JSON.stringify(payload.features || []),
      payload.notes || null
    ]
  );
  return result.rows[0];
}

async function updateTransport(companyId, transportId, payload) {
  const updates = [];
  const params = [companyId, transportId];

  const scalarMap = {
    name: 'name',
    vehicleType: 'vehicle_type',
    plateNumber: 'plate_number',
    capacity: 'capacity',
    hasAc: 'has_ac',
    notes: 'notes',
    isActive: 'is_active'
  };

  for (const [key, col] of Object.entries(scalarMap)) {
    if (payload[key] !== undefined) {
      params.push(payload[key]);
      updates.push(`${col} = $${params.length}`);
    }
  }

  if (payload.features !== undefined) {
    params.push(JSON.stringify(payload.features));
    updates.push(`features = $${params.length}::jsonb`);
  }

  if (updates.length === 0) {
    return findTransportById(companyId, transportId);
  }

  updates.push('updated_at = NOW()');

  const result = await query(
    `
    UPDATE transports
    SET ${updates.join(', ')}
    WHERE company_id = $1 AND id = $2
    RETURNING *
    `,
    params
  );
  return result.rows[0] || null;
}

async function getDashboardMetrics(companyId) {
  const [countsResult, walletResult, recentBookingsResult] = await Promise.all([
    query(
      `
      SELECT
        (SELECT COUNT(*)::INTEGER FROM destinations WHERE company_id = $1 AND moderation_status <> 'archived') AS destinations_count,
        (SELECT COUNT(*)::INTEGER FROM experiences WHERE company_id = $1 AND moderation_status <> 'archived') AS experiences_count,
        (SELECT COUNT(*)::INTEGER FROM expeditions WHERE company_id = $1 AND status IN ('published', 'open', 'full', 'in_progress')) AS active_expeditions_count,
        (SELECT COUNT(*)::INTEGER FROM bookings WHERE company_id = $1) AS total_bookings,
        (SELECT COUNT(*)::INTEGER FROM bookings WHERE company_id = $1 AND status IN ('confirmed', 'checked_in')) AS active_bookings,
        (SELECT COALESCE(SUM(total_price_kz), 0)::NUMERIC(14,2) FROM bookings WHERE company_id = $1 AND payment_status = 'paid') AS gross_revenue_kz,
        (SELECT COUNT(*)::INTEGER FROM guides WHERE company_id = $1 AND is_active = TRUE) AS guides_count,
        (SELECT COUNT(*)::INTEGER FROM transports WHERE company_id = $1 AND is_active = TRUE) AS transports_count
      `,
      [companyId]
    ),
    query(
      `
      SELECT account_code, available_balance, reserved_balance, currency
      FROM wallets
      WHERE owner_company_id = $1 AND owner_type = 'company'
      LIMIT 1
      `,
      [companyId]
    ),
    query(
      `
      SELECT
        b.id,
        b.reference_code,
        b.status,
        b.payment_status,
        b.participants_count,
        b.total_price_kz,
        b.scheduled_date,
        b.created_at,
        u.full_name AS tourist_name,
        COALESCE(exd.title, exp.title) AS item_title
      FROM bookings b
      INNER JOIN users u ON u.id = b.user_id
      LEFT JOIN experiences exp ON exp.id = b.experience_id
      LEFT JOIN expeditions exd ON exd.id = b.expedition_id
      WHERE b.company_id = $1
      ORDER BY b.created_at DESC
      LIMIT 8
      `,
      [companyId]
    )
  ]);

  return {
    ...countsResult.rows[0],
    wallet: walletResult.rows[0] || {
      account_code: null,
      available_balance: 0,
      reserved_balance: 0,
      currency: 'AOA'
    },
    recentBookings: recentBookingsResult.rows
  };
}

async function getOperationalReports(companyId, filters = {}) {
  const params = [companyId];
  let dateCondition = '';

  if (filters.startDate) {
    params.push(filters.startDate);
    dateCondition += ` AND b.created_at >= $${params.length}`;
  }
  if (filters.endDate) {
    params.push(filters.endDate);
    dateCondition += ` AND b.created_at <= $${params.length}`;
  }

  const [byStatus, byMonth, topItems] = await Promise.all([
    query(
      `
      SELECT
        b.status,
        COUNT(*)::INTEGER AS total_count,
        COALESCE(SUM(b.participants_count), 0)::INTEGER AS total_participants,
        COALESCE(SUM(b.total_price_kz), 0)::NUMERIC(14,2) AS total_amount_kz
      FROM bookings b
      WHERE b.company_id = $1 ${dateCondition}
      GROUP BY b.status
      ORDER BY total_count DESC
      `,
      params
    ),
    query(
      `
      SELECT
        TO_CHAR(DATE_TRUNC('month', b.created_at), 'YYYY-MM') AS month,
        COUNT(*)::INTEGER AS bookings_count,
        COALESCE(SUM(b.total_price_kz) FILTER (WHERE b.payment_status = 'paid'), 0)::NUMERIC(14,2) AS paid_revenue_kz
      FROM bookings b
      WHERE b.company_id = $1 ${dateCondition}
      GROUP BY DATE_TRUNC('month', b.created_at)
      ORDER BY DATE_TRUNC('month', b.created_at) DESC
      LIMIT 12
      `,
      params
    ),
    query(
      `
      SELECT
        COALESCE(exd.title, exp.title) AS title,
        b.booking_type,
        COUNT(*)::INTEGER AS bookings_count,
        COALESCE(SUM(b.participants_count), 0)::INTEGER AS participants_count,
        COALESCE(SUM(b.total_price_kz) FILTER (WHERE b.payment_status = 'paid'), 0)::NUMERIC(14,2) AS revenue_kz
      FROM bookings b
      LEFT JOIN experiences exp ON exp.id = b.experience_id
      LEFT JOIN expeditions exd ON exd.id = b.expedition_id
      WHERE b.company_id = $1 ${dateCondition}
      GROUP BY COALESCE(exd.title, exp.title), b.booking_type
      ORDER BY revenue_kz DESC
      LIMIT 10
      `,
      params
    )
  ]);

  return {
    bookingsByStatus: byStatus.rows,
    monthlyRevenue: byMonth.rows,
    topPerformers: topItems.rows
  };
}

module.exports = {
  findById,
  findDetailedById,
  findAllAdmin,
  createCompany,
  updateCompany,
  updateCompanyMedia,
  updateStatus,
  findMembership,
  findMembershipById,
  addMember,
  findTeamMembers,
  updateMember,
  findAdminUserIds,
  findGuides,
  findGuideById,
  createGuide,
  updateGuide,
  findTransports,
  findTransportById,
  createTransport,
  updateTransport,
  getDashboardMetrics,
  getOperationalReports
};