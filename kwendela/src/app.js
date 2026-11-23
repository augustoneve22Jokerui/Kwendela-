'use strict';

const path = require('path');
const express = require('express');
const expressLayouts = require('express-ejs-layouts');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');

const env = require('./config/env');
const logger = require('./config/logger');
const { setupOpenApi } = require('./config/openapi');
const { csrfProtection } = require('./middlewares/csrf.middleware');
const { viewLocals } = require('./middlewares/viewLocals.middleware');
const { notFoundHandler, errorHandler } = require('./middlewares/error.middleware');
const apiRoutes = require('./routes/api');
const webRoutes = require('./routes/web');

const app = express();

app.set('trust proxy', 1);
app.disable('x-powered-by');

app.set('view engine', 'ejs');
app.set('views', path.resolve(process.cwd(), 'src/views'));
app.use(expressLayouts);
app.set('layout', 'layouts/public');

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          'https://cdn.jsdelivr.net',
          'https://api.mapbox.com',
          'https://maps.googleapis.com'
        ],
        scriptSrcAttr: ["'unsafe-inline'"],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          'https://cdn.jsdelivr.net',
          'https://fonts.googleapis.com',
          'https://api.mapbox.com'
        ],
        fontSrc: [
          "'self'",
          'data:',
          'https://cdn.jsdelivr.net',
          'https://fonts.gstatic.com'
        ],
        imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
        mediaSrc: ["'self'", 'data:', 'blob:', 'https:'],
        connectSrc: [
          "'self'",
          'ws:',
          'wss:',
          'https://cdn.jsdelivr.net',
          'https://api.mapbox.com',
          'https://events.mapbox.com',
          'https://maps.googleapis.com'
        ],
        workerSrc: ["'self'", 'blob:'],
        objectSrc: ["'none'"],
        frameAncestors: ["'self'"]
      }
    },
    crossOriginEmbedderPolicy: false
  })
);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        return callback(null, true);
      }
      if (env.cors.origins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error('Origem não autorizada pela política CORS.'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-CSRF-Token',
      'X-XSRF-Token',
      'X-Idempotency-Key'
    ]
  })
);

app.use(compression());
app.use(cookieParser(env.cookie.secret));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

if (!env.isTest) {
  app.use(morgan(env.isProduction ? 'combined' : 'dev', { stream: logger.stream }));
}

app.use(
  express.static(path.resolve(process.cwd(), 'public'), {
    maxAge: env.isProduction ? '7d' : 0,
    etag: true
  })
);

setupOpenApi(app);

app.use(csrfProtection);
app.use(viewLocals);

app.use('/api/v1', apiRoutes);
app.use('/', webRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
