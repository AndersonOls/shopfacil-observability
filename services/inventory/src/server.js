'use strict';

const { initTelemetry } = require('@shopfacil/telemetry');

initTelemetry({ serviceName: process.env.OTEL_SERVICE_NAME || 'inventory' });

const { buildApp } = require('./app');

const port = Number(process.env.PORT || 3002);
const host = process.env.HOST || '0.0.0.0';

const app = buildApp({ dbPath: process.env.DB_PATH });

app
  .listen({ port, host })
  .then(() => app.log.info({ port, host }, 'inventory listening'))
  .catch((err) => {
    app.log.error(err, 'inventory failed to start');
    process.exit(1);
  });
