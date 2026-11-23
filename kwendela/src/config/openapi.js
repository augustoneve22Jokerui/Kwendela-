'use strict';

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const swaggerUi = require('swagger-ui-express');
const env = require('./env');
const logger = require('./logger');

const OPENAPI_SPEC_PATH = path.resolve(process.cwd(), 'docs/openapi.yaml');

function loadOpenApiSpec() {
  if (!fs.existsSync(OPENAPI_SPEC_PATH)) {
    logger.warn('Ficheiro OpenAPI não encontrado em docs/openapi.yaml');
    return null;
  }

  try {
    const rawYaml = fs.readFileSync(OPENAPI_SPEC_PATH, 'utf8');
    const spec = yaml.load(rawYaml);

    if (spec && typeof spec === 'object') {
      spec.servers = [
        {
          url: `${env.appUrl.replace(/\/$/, '')}/api/v1`,
          description: env.isProduction ? 'Produção KWENDELA' : 'Ambiente Atual'
        }
      ];
    }

    return spec;
  } catch (err) {
    logger.error('Erro ao carregar especificação OpenAPI', {
      message: err.message
    });
    return null;
  }
}

function setupOpenApi(app) {
  const spec = loadOpenApiSpec();
  if (!spec) {
    return;
  }

  app.get('/api/docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.status(200).json(spec);
  });

  app.use(
    '/api/docs',
    swaggerUi.serve,
    swaggerUi.setup(spec, {
      explorer: true,
      customSiteTitle: `${env.appName} — Documentação API v1`
    })
  );
}

module.exports = {
  loadOpenApiSpec,
  setupOpenApi
};