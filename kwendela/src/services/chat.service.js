'use strict';

const { withTransaction } = require('../config/database');
const ApiError = require('../utils/ApiError');
const { buildPaginationMeta } = require('../utils/pagination');
const { recordAuditLog } = require('../middlewares/audit.middleware');
const chatRepository = require('../repositories/chat.repository');
const companyRepository = require('../repositories/company.repository');
const bookingRepository = require('../repositories/booking.repository');
const reportRepository = require('../repositories/report.repository');
const notificationService = require('./notification.service');

async function assertConversationAccess(conversationId, user) {
  const conversation = await chatRepository.findConversationById(conversationId);
  if (!conversation) {
    throw ApiError.notFound('Conversa não encontrada.');
  }

  const isDirectParticipant = await chatRepository.isUserParticipant(conversationId, user.id);
  const isCompanyMember =
    conversation.company_id &&
    user.companyId &&
    String(conversation.company_id) === String(user.companyId);

  if (!isDirectParticipant && !isCompanyMember && user.role !== 'superadmin') {
    throw ApiError.forbidden('Não tem autorização para aceder a esta conversa.');
  }

  return conversation;
}

async function listUserConversations(user, pagination) {
  const { items, total } = await chatRepository.findConversationsForUser(
    {
      userId: user.id,
      companyId: user.companyId || null
    },
    pagination
  );

  return {
    items,
    pagination: buildPaginationMeta({
      page: pagination.page,
      limit: pagination.limit,
      total
    })
  };
}

async function createOrGetConversation(payload, user) {
  let targetCompanyId = payload.companyId || null;
  let participantUserIds = [user.id];

  if (payload.bookingId) {
    const booking = await bookingRepository.findById(payload.bookingId);
    if (!booking) {
      throw ApiError.notFound('Reserva associada não encontrada.');
    }

    const isBookingOwner = String(booking.user_id) === String(user.id);
    const isBookingCompany = user.companyId && String(booking.company_id) === String(user.companyId);
    if (!isBookingOwner && !isBookingCompany) {
      throw ApiError.forbidden('Não tem permissão para iniciar conversa sobre esta reserva.');
    }

    targetCompanyId = booking.company_id;
    participantUserIds.push(booking.user_id);
  }

  if (targetCompanyId) {
    const company = await companyRepository.findById(targetCompanyId);
    if (!company || company.status !== 'active') {
      throw ApiError.notFound('Empresa turística não encontrada ou inativa.');
    }
    if (company.owner_user_id) {
      participantUserIds.push(company.owner_user_id);
    }
  }

  if (payload.recipientUserId) {
    participantUserIds.push(payload.recipientUserId);
  }

  const uniqueParticipants = [...new Set(participantUserIds.map(String))];

  const existing = await chatRepository.findExistingConversation({
    companyId: targetCompanyId,
    bookingId: payload.bookingId || null,
    conversationType: payload.conversationType || 'tourist_company',
    participantUserIds: uniqueParticipants
  });

  if (existing) {
    if (payload.initialMessage) {
      await sendMessage({
        conversationId: existing.id,
        sender: user,
        content: payload.initialMessage,
        messageType: 'text'
      });
    }
    return chatRepository.findConversationById(existing.id);
  }

  const created = await withTransaction(async (client) => {
    const conversation = await chatRepository.createConversation(
      {
        companyId: targetCompanyId,
        bookingId: payload.bookingId || null,
        conversationType: payload.conversationType || 'tourist_company',
        subject: payload.subject || null,
        createdByUserId: user.id
      },
      client
    );

    for (const participantId of uniqueParticipants) {
      await chatRepository.addParticipant(conversation.id, participantId, client);
    }

    if (payload.initialMessage) {
      await chatRepository.createMessage(
        {
          conversationId: conversation.id,
          senderUserId: user.id,
          content: payload.initialMessage,
          messageType: 'text'
        },
        client
      );
      await chatRepository.touchConversationLastMessage(conversation.id, client);
    }

    return conversation;
  });

  return chatRepository.findConversationById(created.id);
}

async function getConversationMessages(conversationId, user, pagination) {
  await assertConversationAccess(conversationId, user);

  const { items, total } = await chatRepository.findMessagesByConversation(
    conversationId,
    pagination
  );

  return {
    items,
    pagination: buildPaginationMeta({
      page: pagination.page,
      limit: pagination.limit,
      total
    })
  };
}

async function sendMessage({
  conversationId,
  sender,
  content = '',
  messageType = 'text',
  attachmentUrl = null,
  metadata = {}
}) {
  const conversation = await assertConversationAccess(conversationId, sender);

  const message = await withTransaction(async (client) => {
    await chatRepository.ensureParticipant(conversationId, sender.id, client);

    const saved = await chatRepository.createMessage(
      {
        conversationId,
        senderUserId: sender.id,
        content: content || '',
        messageType,
        attachmentUrl,
        metadata
      },
      client
    );

    await chatRepository.touchConversationLastMessage(conversationId, client);
    return saved;
  });

  const participantIds = await chatRepository.findParticipantUserIds(conversationId);
  const recipientUserIds = participantIds.filter((id) => String(id) !== String(sender.id));

  for (const recipientId of recipientUserIds) {
    await notificationService.createNotification({
      userId: recipientId,
      type: 'chat_message',
      title: `Nova mensagem de ${sender.name || 'Utilizador'}`,
      message: content ? String(content).slice(0, 120) : 'Enviou um anexo na conversa.',
      referenceType: 'conversation',
      referenceId: conversation.id
    });
  }

  return {
    message: {
      ...message,
      sender_name: sender.name
    },
    recipientUserIds
  };
}

async function markConversationAsRead(conversationId, user) {
  await assertConversationAccess(conversationId, user);
  const readAt = new Date().toISOString();
  const updatedCount = await chatRepository.markMessagesAsRead(conversationId, user.id);

  return {
    conversationId,
    readAt,
    updatedCount
  };
}

async function reportConversation(conversationId, { reason, description }, user, requestMeta = {}) {
  await assertConversationAccess(conversationId, user);

  const report = await reportRepository.createReport({
    reporterUserId: user.id,
    targetType: 'conversation',
    targetId: conversationId,
    reason,
    description
  });

  await recordAuditLog({
    actorUserId: user.id,
    action: 'chat.report_conversation',
    entityType: 'report',
    entityId: report.id,
    ipAddress: requestMeta.ip,
    userAgent: requestMeta.userAgent,
    metadata: { conversationId, reason }
  });

  return report;
}

module.exports = {
  assertConversationAccess,
  listUserConversations,
  createOrGetConversation,
  getConversationMessages,
  sendMessage,
  markConversationAsRead,
  reportConversation
};