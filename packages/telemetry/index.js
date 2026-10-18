'use strict';

const { initTelemetry } = require('./src/telemetry');
const { createLogger, REDACT_PATHS } = require('./src/logger');
const {
  createMetrics,
  registerMetrics,
  httpMetricsPlugin,
} = require('./src/metrics');
const promClient = require('prom-client');

module.exports = {
  initTelemetry,
  createLogger,
  REDACT_PATHS,
  createMetrics,
  registerMetrics,
  httpMetricsPlugin,
  promClient,
};
