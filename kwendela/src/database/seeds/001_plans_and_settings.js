'use strict';

const { withTransaction } = require('../../config/database');
const env = require('../../config/env');
const { generateAccountCode } = require('../../utils/crypto');

const DEFAULT_PLANS = [
  {
    code: 'essential',
    name: 'KWENDELA ESSENTIAL',
    description:
      'Plano de entrada para operadores turísticos e guias locais iniciarem a comercialização de experiências e reservas.',
    priceKz: 70000.0,
    billingCycle: 'monthly',
    maxUsers: 3,
    maxExperiences: 10,
    maxDestinations: 3,
    features: {
      analytics: false,
      customRoutes: true,
      realtimeTracking: false,
      prioritySupport: false,
      apiAccess: false,
      verifiedBadge: false,
      featuredListings: false
    },
    limits: {
      maxUsers: 3,
      maxExperiences: 10,
      maxDestinations: 3,
      maxExpeditions: 5
    },
    displayOrder: 1
  },
  {
    code: 'professional',
    name: 'KWENDELA PROFESSIONAL',
    description:
      'Plano profissional para agências em crescimento com expedições programadas, rotas com itinerários e relatórios operacionais.',
    priceKz: 180000.0,
    billingCycle: 'monthly',
    maxUsers: 10,
    maxExperiences: 40,
    maxDestinations: 12,
    features: {
      analytics: true,
      customRoutes: true,
      realtimeTracking: true,
      prioritySupport: false,
      apiAccess: false,
      verifiedBadge: true,
      featuredListings: false
    },
    limits: {
      maxUsers: 10,
      maxExperiences: 40,
      maxDestinations: 12,
      maxExpeditions: 25
    },
    displayOrder: 2
  },
  {
    code: 'business',
    name: 'KWENDELA BUSINESS',
    description:
      'Plano avançado para operadores consolidados com múltiplas equipas, frota, expedições simultâneas e destaque editorial.',
    priceKz: 400000.0,
    billingCycle: 'monthly',
    maxUsers: 25,
    maxExperiences: 120,
    maxDestinations: 40,
    features: {
      analytics: true,
      customRoutes: true,
      realtimeTracking: true,
      prioritySupport: true,
      apiAccess: false,
      verifiedBadge: true,
      featuredListings: true
    },
    limits: {
      maxUsers: 25,
      maxExperiences: 120,
      maxDestinations: 40,
      maxExpeditions: 80
    },
    displayOrder: 3
  },
  {
    code: 'enterprise',
    name: 'KWENDELA ENTERPRISE',
    description:
      'Solução empresarial completa sem limites operacionais para grandes grupos turísticos, consórcios e expansão internacional.',
    priceKz: 800000.0,
    billingCycle: 'monthly',
    maxUsers: -1,
    maxExperiences: -1,
    maxDestinations: -1,
    features: {
      analytics: true,
      customRoutes: true,
      realtimeTracking: true,
      prioritySupport: true,
      apiAccess: true,
      verifiedBadge: true,
      featuredListings: true
    },
    limits: {
      maxUsers: -1,
      maxExperiences: -1,
      maxDestinations: -1,
      maxExpeditions: -1
    },
    displayOrder: 4
  }
];

const DEFAULT_SETTINGS = [
  {
    key: 'platform_commission_percent',
    value: env.wallet.commissionPercent,
    description: 'Percentagem de comissão da plataforma aplicada sobre reservas pagas.'
  },
  {
    key: 'waitlist_confirmation_minutes',
    value: env.waitlist.confirmationMinutes,
    description: 'Prazo em minutos para confirmação de vaga libertada na lista de espera.'
  },
  {
    key: 'wallet_demo_mode',
    value: env.wallet.demoMode,
    description: 'Indica se as operações internas de demonstração da Carteira KWENDELA estão ativas.'
  },
  {
    key: 'tourist_premium_pricing_kz',
    value: {
      monthly: 5000,
      yearly: 50000
    },
    description: 'Preçário em Kwanzas da subscrição KWENDELA Premium para turistas.'
  },
  {
    key: 'default_currency',
    value: 'AOA',
    description: 'Moeda base operacional da plataforma.'
  },
  {
    key: 'support_email',
    value: 'suporte@kwendela.ao',
    description: 'Endereço de contacto oficial para suporte operacional.'
  }
];

async function seedPlansAndSettings() {
  return withTransaction(async (client) => {
    let plansInserted = 0;

    for (const plan of DEFAULT_PLANS) {
      const res = await client.query(
        `
        INSERT INTO plans (
          code,
          name,
          description,
          price_kz,
          billing_cycle,
          max_users,
          max_experiences,
          max_destinations,
          features,
          limits,
          is_active,
          display_order
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, TRUE, $11)
        ON CONFLICT (code) DO NOTHING
        `,
        [
          plan.code,
          plan.name,
          plan.description,
          plan.priceKz,
          plan.billingCycle,
          plan.maxUsers,
          plan.maxExperiences,
          plan.maxDestinations,
          JSON.stringify(plan.features),
          JSON.stringify(plan.limits),
          plan.displayOrder
        ]
      );
      plansInserted += res.rowCount;
    }

    let settingsInserted = 0;

    for (const setting of DEFAULT_SETTINGS) {
      const res = await client.query(
        `
        INSERT INTO global_settings (setting_key, setting_value, description)
        VALUES ($1, $2::jsonb, $3)
        ON CONFLICT (setting_key) DO NOTHING
        `,
        [setting.key, JSON.stringify(setting.value), setting.description]
      );
      settingsInserted += res.rowCount;
    }

    const existingPlatformWallet = await client.query(
      `SELECT id FROM wallets WHERE owner_type = 'platform' LIMIT 1`
    );

    if (existingPlatformWallet.rowCount === 0) {
      await client.query(
        `
        INSERT INTO wallets (owner_type, account_code, currency, available_balance, reserved_balance)
        VALUES ('platform', $1, 'AOA', 0, 0)
        `,
        [generateAccountCode('KWP')]
      );
    }

    return {
      plansCount: DEFAULT_PLANS.length,
      plansInserted,
      settingsCount: DEFAULT_SETTINGS.length,
      settingsInserted
    };
  });
}

module.exports = {
  DEFAULT_PLANS,
  DEFAULT_SETTINGS,
  seedPlansAndSettings
};