'use strict';

const { initTelemetry } = require('@shopfacil/telemetry');

initTelemetry({ serviceName: process.env.OTEL_SERVICE_NAME || 'orders' });

const { buildApp } = require('./app');

const port = Number(process.env.PORT || 3004);
const host = process.env.HOST || '0.0.0.0';

const app = buildApp();

app
  .listen({ port, host })
  .then(() => app.log.info({ port, host }, 'orders listening'))
  .catch((err) => {
    app.log.error(err, 'orders failed to start');
    process.exit(1);
  });
