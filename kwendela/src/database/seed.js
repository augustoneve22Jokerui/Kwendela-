'use strict';

const { closePool } = require('../config/database');
const logger = require('../config/logger');
const { seedPlansAndSettings } = require('./seeds/001_plans_and_settings');
const { seedSuperadmin } = require('./seeds/002_superadmin');

async function runSeeds({ close = false } = {}) {
  try {
    logger.info('A iniciar execução dos seeds KWENDELA...');

    const plansResult = await seedPlansAndSettings();
    const superadminResult = await seedSuperadmin();

    logger.info('Seeds KWENDELA executados com sucesso', {
      plansSeeded: plansResult.plansCount,
      settingsSeeded: plansResult.settingsCount,
      superadminCreated: superadminResult.created
    });

    return {
      plans: plansResult,
      superadmin: superadminResult
    };
  } finally {
    if (close) {
      await closePool();
    }
  }
}

if (require.main === module) {
  runSeeds({ close: true })
    .then(() => {
      process.exit(0);
    })
    .catch((err) => {
      logger.error('Erro crítico ao executar seeds da base de dados', {
        message: err.message
      });
      process.exit(1);
    });
}

module.exports = {
  runSeeds
};