'use strict';

const { withTransaction } = require('../config/database');
const logger = require('../config/logger');

async function processExpiredSubscriptions() {
  return withTransaction(async (client) => {
    const expiredResult = await client.query(
      `
      SELECT cs.id, cs.company_id, cs.plan_id, c.name AS company_name, p.name AS plan_name
      FROM company_subscriptions cs
      INNER JOIN companies c ON c.id = cs.company_id
      INNER JOIN plans p ON p.id = cs.plan_id
      WHERE cs.status = 'active'
        AND cs.ends_at IS NOT NULL
        AND cs.ends_at <= NOW()
      FOR UPDATE OF cs SKIP LOCKED
      `
    );

    let expiredCount = 0;

    for (const sub of expiredResult.rows) {
      await client.query(
        `
        UPDATE company_subscriptions
        SET status = 'expired',
            updated_at = NOW()
        WHERE id = $1
        `,
        [sub.id]
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
        SELECT DISTINCT cm.user_id,
               'subscription_expired',
               'Assinatura expirada',
               $2,
               'company_subscription',
               $3
        FROM company_members cm
        WHERE cm.company_id = $1
          AND cm.is_active = TRUE
          AND cm.role IN ('owner', 'admin')
        `,
        [
          sub.company_id,
          `A assinatura do plano ${sub.plan_name} da empresa ${sub.company_name} expirou. Renove o plano para manter todas as funcionalidades ativas.`,
          sub.id
        ]
      );

      expiredCount += 1;
    }

    const expiringSoonResult = await client.query(
      `
      SELECT cs.id, cs.company_id, cs.ends_at, c.name AS company_name, p.name AS plan_name
      FROM company_subscriptions cs
      INNER JOIN companies c ON c.id = cs.company_id
      INNER JOIN plans p ON p.id = cs.plan_id
      WHERE cs.status = 'active'
        AND cs.ends_at IS NOT NULL
        AND cs.ends_at > NOW()
        AND cs.ends_at <= NOW() + INTERVAL '3 days'
        AND cs.expiry_notified_at IS NULL
      FOR UPDATE OF cs SKIP LOCKED
      `
    );

    let notifiedCount = 0;

    for (const sub of expiringSoonResult.rows) {
      await client.query(
        `
        UPDATE company_subscriptions
        SET expiry_notified_at = NOW(),
            updated_at = NOW()
        WHERE id = $1
        `,
        [sub.id]
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
        SELECT DISTINCT cm.user_id,
               'subscription_expiring_soon',
               'Assinatura prestes a expirar',
               $2,
               'company_subscription',
               $3
        FROM company_members cm
        WHERE cm.company_id = $1
          AND cm.is_active = TRUE
          AND cm.role IN ('owner', 'admin')
        `,
        [
          sub.company_id,
          `A assinatura do plano ${sub.plan_name} da empresa ${sub.company_name} expira em breve. Efetue a renovação para evitar interrupções.`,
          sub.id
        ]
      );

      notifiedCount += 1;
    }

    if (expiredCount > 0 || notifiedCount > 0) {
      logger.info('Processamento de assinaturas concluído', {
        expiredCount,
        notifiedCount
      });
    }

    return { expiredCount, notifiedCount };
  });
}

module.exports = {
  processExpiredSubscriptions
};