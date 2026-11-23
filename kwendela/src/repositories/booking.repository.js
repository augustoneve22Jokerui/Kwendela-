'use strict';

const { query } = require('../config/database');

function exec(client, text, params = []) {
  return client ? client.query(text, params) : query(text, params);
}

async function findByIdempotencyKey(idempotencyKey, userId) {
  const result = await query(
    `
    SELECT *
    FROM bookings
    WHERE idempotency_key = $1 AND user_id = $2
    LIMIT 1
    `,
    [idempotencyKey, userId]
  );
  return result.rows[0] || null;
}

async function findById(bookingId, client = null) {
  const result = await exec(
    client,
    `
    SELECT *
    FROM bookings
    WHERE id = $1
    `,
    [bookingId]
  );
  return result.rows[0] || null;
}

async function findByIdForUpdate(bookingId, client) {
  const result = await client.query(
    `
    SELECT *
    FROM bookings
    WHERE id = $1
    FOR UPDATE
    `,
    [bookingId]
  );
  return result.rows[0] || null;
}

async function findDetailedById(bookingId) {
  const result = await query(
    `
    SELECT
      b.*,
      u.full_name AS tourist_name,
      u.email AS tourist_email,
      u.phone AS tourist_phone,
      c.name AS company_name,
      c.email AS company_email,
      c.phone AS company_phone,
      exp.title AS experience_title,
      exp.slug AS experience_slug,
      exd.title AS expedition_title,
      exd.slug AS expedition_slug,
      exd.start_date AS expedition_start_date,
      exd.end_date AS expedition_end_date,
      exd.departure_time AS expedition_departure_time,
      exd.meeting_point AS expedition_meeting_point
    FROM bookings b
    INNER JOIN users u ON u.id = b.user_id
    INNER JOIN companies c ON c.id = b.company_id
    LEFT JOIN experiences exp ON exp.id = b.experience_id
    LEFT JOIN expeditions exd ON exd.id = b.expedition_id
    WHERE b.id = $1
    `,
    [bookingId]
  );

  const booking = result.rows[0];
  if (!booking) {
    return null;
  }

  const participantsResult = await query(
    `
    SELECT *
    FROM booking_participants
    WHERE booking_id = $1
    ORDER BY created_at ASC
    `,
    [bookingId]
  );

  return {
    ...booking,
    participants: participantsResult.rows
  };
}

async function createBooking(
  {
    referenceCode,
    userId,
    companyId,
    expeditionId = null,
    experienceId = null,
    bookingType,
    scheduledDate,
    participantsCount,
    unitPriceKz,
    totalPriceKz,
    specialRequests = null,
    status = 'confirmed',
    paymentStatus = 'pending',
    paymentMethod = 'wallet',
    idempotencyKey = null
  },
  client = null
) {
  const result = await exec(
    client,
    `
    INSERT INTO bookings (
      reference_code,
      user_id,
      company_id,
      expedition_id,
      experience_id,
      booking_type,
      scheduled_date,
      participants_count,
      unit_price_kz,
      total_price_kz,
      special_requests,
      status,
      payment_status,
      payment_method,
      idempotency_key
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
    RETURNING *
    `,
    [
      referenceCode,
      userId,
      companyId,
      expeditionId,
      experienceId,
      bookingType,
      scheduledDate,
      participantsCount,
      unitPriceKz,
      totalPriceKz,
      specialRequests,
      status,
      paymentStatus,
      paymentMethod,
      idempotencyKey
    ]
  );
  return result.rows[0];
}

async function addParticipants(bookingId, participants = [], client = null) {
  const inserted = [];
  for (const participant of participants) {
    const result = await exec(
      client,
      `
      INSERT INTO booking_participants (
        booking_id,
        full_name,
        document_number,
        phone,
        emergency_contact,
        notes
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
      `,
      [
        bookingId,
        participant.fullName,
        participant.documentNumber || null,
        participant.phone || null,
        participant.emergencyContact || null,
        participant.notes || null
      ]
    );
    inserted.push(result.rows[0]);
  }
  return inserted;
}

async function markPaymentPaid(bookingId, paymentTransactionId, client = null) {
  const result = await exec(
    client,
    `
    UPDATE bookings
    SET payment_status = 'paid',
        payment_transaction_id = $2,
        paid_at = NOW(),
        updated_at = NOW()
    WHERE id = $1
    RETURNING *
    `,
    [bookingId, paymentTransactionId]
  );
  return result.rows[0] || null;
}

async function markPaymentRefunded(bookingId, client = null) {
  const result = await exec(
    client,
    `
    UPDATE bookings
    SET payment_status = 'refunded',
        status = 'refunded',
        updated_at = NOW()
    WHERE id = $1
    RETURNING *
    `,
    [bookingId]
  );
  return result.rows[0] || null;
}

async function updateStatus(
  bookingId,
  { status, cancellationReason = null, cancelledByUserId = null },
  client = null
) {
  const result = await exec(
    client,
    `
    UPDATE bookings
    SET status = $2,
        cancellation_reason = COALESCE($3, cancellation_reason),
        cancelled_by_user_id = COALESCE($4, cancelled_by_user_id),
        cancelled_at = CASE WHEN $2 IN ('cancelled', 'refunded') THEN NOW() ELSE cancelled_at END,
        updated_at = NOW()
    WHERE id = $1
    RETURNING *
    `,
    [bookingId, status, cancellationReason, cancelledByUserId]
  );
  return result.rows[0] || null;
}

async function findByUser(userId, filters = {}, pagination = { limit: 12, offset: 0 }) {
  const conditions = ['b.user_id = $1'];
  const params = [userId];

  if (filters.status) {
    params.push(filters.status);
    conditions.push(`b.status = $${params.length}`);
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;

  const countResult = await query(
    `SELECT COUNT(*)::INTEGER AS total FROM bookings b ${whereClause}`,
    params
  );

  params.push(pagination.limit, pagination.offset);

  const listResult = await query(
    `
    SELECT
      b.*,
      c.name AS company_name,
      exp.title AS experience_title,
      exp.slug AS experience_slug,
      exp.cover_image_url AS experience_cover,
      exd.title AS expedition_title,
      exd.slug AS expedition_slug,
      exd.cover_image_url AS expedition_cover
    FROM bookings b
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

async function findByCompany(companyId, filters = {}, pagination = { limit: 20, offset: 0 }) {
  const conditions = ['b.company_id = $1'];
  const params = [companyId];

  if (filters.status) {
    params.push(filters.status);
    conditions.push(`b.status = $${params.length}`);
  }

  if (filters.expeditionId) {
    params.push(filters.expeditionId);
    conditions.push(`b.expedition_id = $${params.length}`);
  }

  if (filters.search) {
    params.push(`%${filters.search}%`);
    conditions.push(`(b.reference_code ILIKE $${params.length} OR u.full_name ILIKE $${params.length})`);
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;

  const countResult = await query(
    `
    SELECT COUNT(*)::INTEGER AS total
    FROM bookings b
    INNER JOIN users u ON u.id = b.user_id
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
      u.phone AS tourist_phone,
      exp.title AS experience_title,
      exd.title AS expedition_title
    FROM bookings b
    INNER JOIN users u ON u.id = b.user_id
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

async function countActiveWaitlistHolds(expeditionId, client = null) {
  const result = await exec(
    client,
    `
    SELECT COALESCE(SUM(participants_count), 0)::INTEGER AS held_spots
    FROM expedition_waitlist
    WHERE expedition_id = $1
      AND status = 'notified'
      AND confirmation_deadline_at > NOW()
    `,
    [expeditionId]
  );
  return result.rows[0].held_spots;
}

async function findActiveWaitlistEntry(expeditionId, userId, client = null) {
  const result = await exec(
    client,
    `
    SELECT *
    FROM expedition_waitlist
    WHERE expedition_id = $1
      AND user_id = $2
      AND status IN ('waiting', 'notified')
    LIMIT 1
    `,
    [expeditionId, userId]
  );
  return result.rows[0] || null;
}

async function getNextWaitlistPosition(expeditionId, client) {
  const result = await client.query(
    `
    SELECT (COALESCE(MAX(position), 0) + 1)::INTEGER AS next_position
    FROM expedition_waitlist
    WHERE expedition_id = $1
    `,
    [expeditionId]
  );
  return result.rows[0].next_position;
}

async function createWaitlistEntry(
  { expeditionId, userId, participantsCount, position, notes = null },
  client = null
) {
  const result = await exec(
    client,
    `
    INSERT INTO expedition_waitlist (
      expedition_id,
      user_id,
      participants_count,
      position,
      status,
      notes
    )
    VALUES ($1, $2, $3, $4, 'waiting', $5)
    RETURNING *
    `,
    [expeditionId, userId, participantsCount, position, notes]
  );
  return result.rows[0];
}

async function findWaitlistByIdForUpdate(waitlistId, client) {
  const result = await client.query(
    `
    SELECT *
    FROM expedition_waitlist
    WHERE id = $1
    FOR UPDATE
    `,
    [waitlistId]
  );
  return result.rows[0] || null;
}

async function markWaitlistConfirmed(waitlistId, bookingId, client = null) {
  const result = await exec(
    client,
    `
    UPDATE expedition_waitlist
    SET status = 'confirmed',
        confirmed_booking_id = $2,
        confirmed_at = NOW(),
        updated_at = NOW()
    WHERE id = $1
    RETURNING *
    `,
    [waitlistId, bookingId]
  );
  return result.rows[0] || null;
}

async function findUserWaitlistEntries(userId) {
  const result = await query(
    `
    SELECT
      ew.*,
      e.title AS expedition_title,
      e.slug AS expedition_slug,
      e.start_date,
      e.end_date,
      e.price_per_participant,
      c.name AS company_name,
      d.name AS destination_name
    FROM expedition_waitlist ew
    INNER JOIN expeditions e ON e.id = ew.expedition_id
    INNER JOIN companies c ON c.id = e.company_id
    LEFT JOIN destinations d ON d.id = e.destination_id
    WHERE ew.user_id = $1
    ORDER BY ew.created_at DESC
    `,
    [userId]
  );
  return result.rows;
}

async function findWaitlistByExpedition(expeditionId) {
  const result = await query(
    `
    SELECT
      ew.*,
      u.full_name AS user_name,
      u.email AS user_email,
      u.phone AS user_phone
    FROM expedition_waitlist ew
    INNER JOIN users u ON u.id = ew.user_id
    WHERE ew.expedition_id = $1
    ORDER BY ew.position ASC, ew.created_at ASC
    `,
    [expeditionId]
  );
  return result.rows;
}

async function findConfirmedUserIdsByExpedition(expeditionId) {
  const result = await query(
    `
    SELECT DISTINCT user_id
    FROM bookings
    WHERE expedition_id = $1
      AND status IN ('confirmed', 'checked_in')
    `,
    [expeditionId]
  );
  return result.rows.map((r) => r.user_id);
}

async function findParticipantsByExpedition(expeditionId) {
  const result = await query(
    `
    SELECT
      b.id AS booking_id,
      b.reference_code,
      b.status AS booking_status,
      b.participants_count,
      u.full_name AS buyer_name,
      u.email AS buyer_email,
      u.phone AS buyer_phone,
      bp.id AS participant_id,
      bp.full_name AS participant_name,
      bp.document_number,
      bp.phone AS participant_phone,
      bp.emergency_contact,
      bp.notes AS participant_notes
    FROM bookings b
    INNER JOIN users u ON u.id = b.user_id
    LEFT JOIN booking_participants bp ON bp.booking_id = b.id
    WHERE b.expedition_id = $1
      AND b.status IN ('confirmed', 'checked_in', 'completed')
    ORDER BY b.created_at ASC
    `,
    [expeditionId]
  );
  return result.rows;
}

async function hasConfirmedBookingForExpedition(expeditionId, userId) {
  const result = await query(
    `
    SELECT 1
    FROM bookings
    WHERE expedition_id = $1
      AND user_id = $2
      AND status IN ('confirmed', 'checked_in', 'completed')
    LIMIT 1
    `,
    [expeditionId, userId]
  );
  return result.rowCount > 0;
}

module.exports = {
  findByIdempotencyKey,
  findById,
  findByIdForUpdate,
  findDetailedById,
  createBooking,
  addParticipants,
  markPaymentPaid,
  markPaymentRefunded,
  updateStatus,
  findByUser,
  findByCompany,
  countActiveWaitlistHolds,
  findActiveWaitlistEntry,
  getNextWaitlistPosition,
  createWaitlistEntry,
  findWaitlistByIdForUpdate,
  markWaitlistConfirmed,
  findUserWaitlistEntries,
  findWaitlistByExpedition,
  findConfirmedUserIdsByExpedition,
  findParticipantsByExpedition,
  hasConfirmedBookingForExpedition
};