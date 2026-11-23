'use strict';

const { query } = require('../config/database');

function exec(client, text, params = []) {
  return client ? client.query(text, params) : query(text, params);
}

async function findConversationById(conversationId) {
  const result = await query(
    `
    SELECT
      c.*,
      comp.name AS company_name,
      comp.logo_url AS company_logo_url,
      b.reference_code AS booking_reference,
      COALESCE(
        (
          SELECT json_agg(
            json_build_object(
              'userId', u.id,
              'fullName', u.full_name,
              'role', u.role,
              'avatarUrl', u.avatar_url
            )
          )
          FROM conversation_participants cp
          INNER JOIN users u ON u.id = cp.user_id
          WHERE cp.conversation_id = c.id
        ),
        '[]'::json
      ) AS participants
    FROM conversations c
    LEFT JOIN companies comp ON comp.id = c.company_id
    LEFT JOIN bookings b ON b.id = c.booking_id
    WHERE c.id = $1
    `,
    [conversationId]
  );
  return result.rows[0] || null;
}

async function isUserParticipant(conversationId, userId) {
  const result = await query(
    `
    SELECT 1
    FROM conversation_participants
    WHERE conversation_id = $1 AND user_id = $2
    LIMIT 1
    `,
    [conversationId, userId]
  );
  return result.rowCount > 0;
}

async function findConversationsForUser(
  { userId, companyId = null },
  pagination = { limit: 20, offset: 0 }
) {
  const params = [userId];
  let accessCondition = `EXISTS (
    SELECT 1 FROM conversation_participants cp
    WHERE cp.conversation_id = c.id AND cp.user_id = $1
  )`;

  if (companyId) {
    params.push(companyId);
    accessCondition = `(${accessCondition} OR c.company_id = $${params.length})`;
  }

  const countResult = await query(
    `
    SELECT COUNT(*)::INTEGER AS total
    FROM conversations c
    WHERE ${accessCondition}
    `,
    params
  );

  params.push(pagination.limit, pagination.offset);

  const listResult = await query(
    `
    SELECT
      c.*,
      comp.name AS company_name,
      comp.logo_url AS company_logo_url,
      b.reference_code AS booking_reference,
      (
        SELECT m.content
        FROM messages m
        WHERE m.conversation_id = c.id
        ORDER BY m.created_at DESC
        LIMIT 1
      ) AS last_message_preview,
      (
        SELECT COUNT(*)::INTEGER
        FROM messages m
        WHERE m.conversation_id = c.id
          AND m.sender_user_id <> $1
          AND m.is_read = FALSE
      ) AS unread_count,
      COALESCE(
        (
          SELECT json_agg(
            json_build_object(
              'userId', u.id,
              'fullName', u.full_name,
              'role', u.role
            )
          )
          FROM conversation_participants cp2
          INNER JOIN users u ON u.id = cp2.user_id
          WHERE cp2.conversation_id = c.id
        ),
        '[]'::json
      ) AS participants
    FROM conversations c
    LEFT JOIN companies comp ON comp.id = c.company_id
    LEFT JOIN bookings b ON b.id = c.booking_id
    WHERE ${accessCondition}
    ORDER BY COALESCE(c.last_message_at, c.created_at) DESC
    LIMIT $${params.length - 1} OFFSET $${params.length}
    `,
    params
  );

  return {
    items: listResult.rows,
    total: countResult.rows[0].total
  };
}

async function findExistingConversation({
  companyId = null,
  bookingId = null,
  conversationType = 'tourist_company',
  participantUserIds = []
}) {
  const conditions = ['c.conversation_type = $1'];
  const params = [conversationType];

  if (companyId) {
    params.push(companyId);
    conditions.push(`c.company_id = $${params.length}`);
  } else {
    conditions.push('c.company_id IS NULL');
  }

  if (bookingId) {
    params.push(bookingId);
    conditions.push(`c.booking_id = $${params.length}`);
  } else {
    conditions.push('c.booking_id IS NULL');
  }

  for (const uid of participantUserIds) {
    params.push(uid);
    conditions.push(`EXISTS (
      SELECT 1 FROM conversation_participants cp
      WHERE cp.conversation_id = c.id AND cp.user_id = $${params.length}
    )`);
  }

  const result = await query(
    `
    SELECT c.*
    FROM conversations c
    WHERE ${conditions.join(' AND ')}
    LIMIT 1
    `,
    params
  );
  return result.rows[0] || null;
}

async function createConversation(
  {
    companyId = null,
    bookingId = null,
    conversationType = 'tourist_company',
    subject = null,
    createdByUserId
  },
  client = null
) {
  const result = await exec(
    client,
    `
    INSERT INTO conversations (
      company_id,
      booking_id,
      conversation_type,
      subject,
      created_by_user_id
    )
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *
    `,
    [companyId, bookingId, conversationType, subject, createdByUserId]
  );
  return result.rows[0];
}

async function addParticipant(conversationId, userId, client = null) {
  await exec(
    client,
    `
    INSERT INTO conversation_participants (conversation_id, user_id)
    VALUES ($1, $2)
    ON CONFLICT (conversation_id, user_id) DO NOTHING
    `,
    [conversationId, userId]
  );
}

async function ensureParticipant(conversationId, userId, client = null) {
  return addParticipant(conversationId, userId, client);
}

async function createMessage(
  {
    conversationId,
    senderUserId,
    content = '',
    messageType = 'text',
    attachmentUrl = null,
    metadata = {}
  },
  client = null
) {
  const result = await exec(
    client,
    `
    INSERT INTO messages (
      conversation_id,
      sender_user_id,
      content,
      message_type,
      attachment_url,
      metadata
    )
    VALUES ($1, $2, $3, $4, $5, $6::jsonb)
    RETURNING *
    `,
    [
      conversationId,
      senderUserId,
      content,
      messageType,
      attachmentUrl,
      JSON.stringify(metadata || {})
    ]
  );
  return result.rows[0];
}

async function touchConversationLastMessage(conversationId, client = null) {
  await exec(
    client,
    `
    UPDATE conversations
    SET last_message_at = NOW(),
        updated_at = NOW()
    WHERE id = $1
    `,
    [conversationId]
  );
}

async function findMessagesByConversation(
  conversationId,
  pagination = { limit: 50, offset: 0 }
) {
  const countResult = await query(
    `SELECT COUNT(*)::INTEGER AS total FROM messages WHERE conversation_id = $1`,
    [conversationId]
  );

  const listResult = await query(
    `
    SELECT
      m.*,
      u.full_name AS sender_name,
      u.role AS sender_role,
      u.avatar_url AS sender_avatar_url
    FROM messages m
    INNER JOIN users u ON u.id = m.sender_user_id
    WHERE m.conversation_id = $1
    ORDER BY m.created_at ASC
    LIMIT $2 OFFSET $3
    `,
    [conversationId, pagination.limit, pagination.offset]
  );

  return {
    items: listResult.rows,
    total: countResult.rows[0].total
  };
}

async function findParticipantUserIds(conversationId) {
  const result = await query(
    `
    SELECT user_id
    FROM conversation_participants
    WHERE conversation_id = $1
    `,
    [conversationId]
  );
  return result.rows.map((r) => r.user_id);
}

async function markMessagesAsRead(conversationId, readerUserId) {
  const result = await query(
    `
    UPDATE messages
    SET is_read = TRUE,
        read_at = NOW()
    WHERE conversation_id = $1
      AND sender_user_id <> $2
      AND is_read = FALSE
    `,
    [conversationId, readerUserId]
  );

  await query(
    `
    UPDATE conversation_participants
    SET last_read_at = NOW()
    WHERE conversation_id = $1 AND user_id = $2
    `,
    [conversationId, readerUserId]
  );

  return result.rowCount;
}

module.exports = {
  findConversationById,
  isUserParticipant,
  findConversationsForUser,
  findExistingConversation,
  createConversation,
  addParticipant,
  ensureParticipant,
  createMessage,
  touchConversationLastMessage,
  findMessagesByConversation,
  findParticipantUserIds,
  markMessagesAsRead
};