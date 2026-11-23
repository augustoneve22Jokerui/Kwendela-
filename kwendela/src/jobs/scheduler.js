'use strict';

const cron = require('node-cron');
const env = require('../config/env');
const logger = require('../config/logger');
const { processExpiredWaitlists } = require('./waitlist.job');
const { processExpiredSubscriptions } = require('./subscription.job');

const scheduledTasks = [];
let isWaitlistRunning = false;
let isSubscriptionRunning = false;

function startJobs() {
  if (env.isTest) {
    logger.debug('Agendador de jobs desativado em ambiente de testes.');
    return;
  }

  if (scheduledTasks.length > 0) {
    return;
  }

  const waitlistTask = cron.schedule('*/1 * * * *', async () => {
    if (isWaitlistRunning) {
      return;
    }
    isWaitlistRunning = true;
    try {
      await processExpiredWaitlists();
    } catch (err) {
      logger.error('Erro na execução do job de lista de espera', {
        message: err.message
      });
    } finally {
      isWaitlistRunning = false;
    }
  });

  const subscriptionTask = cron.schedule('*/15 * * * *', async () => {
    if (isSubscriptionRunning) {
      return;
    }
    isSubscriptionRunning = true;
    try {
      await processExpiredSubscriptions();
    } catch (err) {
      logger.error('Erro na execução do job de assinaturas', {
        message: err.message
      });
    } finally {
      isSubscriptionRunning = false;
    }
  });

  scheduledTasks.push(waitlistTask, subscriptionTask);
  logger.info('Agendador de jobs KWENDELA iniciado com sucesso.');
}

function stopJobs() {
  while (scheduledTasks.length > 0) {
    const task = scheduledTasks.pop();
    if (task && typeof task.stop === 'function') {
      task.stop();
    }
  }
  logger.info('Agendador de jobs KWENDELA encerrado.');
}

module.exports = {
  startJobs,
  stopJobs
};