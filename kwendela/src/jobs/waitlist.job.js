'use strict';

const { withTransaction } = require('../config/database');
const env = require('../config/env');
const logger = require('../config/logger');

async function promoteWaitlistForExpedition(client, expeditionId) {
  const expResult = await client.query(
    `
    SELECT id, title, max_capacity, reserved_spots, status
    FROM expeditions
    WHERE id = $1
    FOR UPDATE
    `,
    [expeditionId]
  );

  if (expResult.rowCount === 0) {
    return 0;
  }

  const expedition = expResult.rows[0];
  if (!['published', 'open', 'full'].includes(expedition.status)) {
    return 0;
  }

  const heldResult = await client.query(
    `
    SELECT COALESCE(SUM(participants_count), 0)::INTEGER AS held_spots
    FROM expedition_waitlist
    WHERE expedition_id = $1
      AND status = 'notified'
      AND confirmation_deadline_at > NOW()
    `,
    [expeditionId]
  );

  let availableSpots =
    Number(expedition.max_capacity) -
    Number(expedition.reserved_spots) -
    Number(heldResult.rows[0].held_spots || 0);

  let promotedCount = 0;

  while (availableSpots > 0) {
    const nextResult = await client.query(
      `
      SELECT id, user_id, participants_count, position
      FROM expedition_waitlist
      WHERE expedition_id = $1
        AND status = 'waiting'
      ORDER BY position ASC, created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
      `,
      [expeditionId]
    );

    if (nextResult.rowCount === 0) {
      break;
    }

    const nextEntry = nextResult.rows[0];
    if (Number(nextEntry.participants_count) > availableSpots) {
      break;
    }

    const confirmationMinutes = env.waitlist.confirmationMinutes;

    const updated = await client.query(
      `
      UPDATE expedition_waitlist
      SET status = 'notified',
          notified_at = NOW(),
          confirmation_deadline_at = NOW() + make_interval(mins => $2),
          updated_at = NOW()
      WHERE id = $1
      RETURNING confirmation_deadline_at
      `,
      [nextEntry.id, confirmationMinutes]
    );

    const deadline = updated.rows[0].confirmation_deadline_at;

    await client.query(
      `
      INSERT INTO notifications (
        user_id,
        type,
        title,
        message,
        reference_type,
        reference_id,
        metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
      `,
      [
        nextEntry.user_id,
        'waitlist_spot_available',
        'Vaga disponível na expedição',
        `Libertou-se vaga na expedição "${expedition.title}". Confirme a sua participação dentro de ${confirmationMinutes} minutos antes de perder a prioridade.`,
        'expedition_waitlist',
        nextEntry.id,
        JSON.stringify({
          expeditionId: expedition.id,
          waitlistId: nextEntry.id,
          participantsCount: nextEntry.participants_count,
          confirmationDeadlineAt: deadline
        })
      ]
    );

    availableSpots -= Number(nextEntry.participants_count);
    promotedCount += 1;
  }

  return promotedCount;
}

async function processExpiredWaitlists() {
  return withTransaction(async (client) => {
    const expiredResult = await client.query(
      `
      SELECT ew.id, ew.expedition_id, ew.user_id, e.title AS expedition_title
      FROM expedition_waitlist ew
      INNER JOIN expeditions e ON e.id = ew.expedition_id
      WHERE ew.status = 'notified'
        AND ew.confirmation_deadline_at IS NOT NULL
        AND ew.confirmation_deadline_at <= NOW()
      FOR UPDATE OF ew SKIP LOCKED
      `
    );

    const affectedExpeditionIds = new Set();
    let expiredCount = 0;

    for (const entry of expiredResult.rows) {
      await client.query(
        `
        UPDATE expedition_waitlist
        SET status = 'expired',
            updated_at = NOW()
        WHERE id = $1
        `,
        [entry.id]
      );

      await client.query(
        `
        INSERT INTO notifications (
          user_id,
          type,
          title,
          message,
          reference_type,
          reference_id
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        `,
        [
          entry.user_id,
          'waitlist_offer_expired',
          'Prazo de confirmação expirado',
          `O prazo para confirmar a sua vaga na expedição "${entry.expedition_title}" expirou e a vaga foi atribuída ao próximo participante da lista de espera.`,
          'expedition_waitlist',
          entry.id
        ]
      );

      affectedExpeditionIds.add(entry.expedition_id);
      expiredCount += 1;
    }

    let promotedCount = 0;
    for (const expeditionId of affectedExpeditionIds) {
      promotedCount += await promoteWaitlistForExpedition(client, expeditionId);
    }

    if (expiredCount > 0 || promotedCount > 0) {
      logger.info('Processamento da lista de espera concluído', {
        expiredCount,
        promotedCount
      });
    }

    return { expiredCount, promotedCount };
  });
}

module.exports = {
  promoteWaitlistForExpedition,
  processExpiredWaitlists
};