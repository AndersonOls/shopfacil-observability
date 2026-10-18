'use strict';

const client = require('prom-client');

const DEFAULT_BUCKETS = [
  0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10,
];

function createMetrics(serviceName) {
  const registry = new client.Registry();
  registry.setDefaultLabels({ service: serviceName });
  client.collectDefaultMetrics({ register: registry });

  const api = {
    registry,
    contentType: registry.contentType,
    createCounter(name, help, labelNames = []) {
      return new client.Counter({ name, help, labelNames, registers: [registry] });
    },
    createGauge(name, help, labelNames = []) {
      return new client.Gauge({ name, help, labelNames, registers: [registry] });
    },
    createHistogram(name, help, labelNames = [], buckets = DEFAULT_BUCKETS) {
      return new client.Histogram({
        name,
        help,
        labelNames,
        buckets,
        registers: [registry],
      });
    },
    metricsText() {
      return registry.metrics();
    },
  };

  api.httpDuration = api.createHistogram(
    'http_server_request_duration_seconds',
    'HTTP server request duration in seconds',
    ['method', 'route', 'status_code'],
  );
  api.httpRequests = api.createCounter(
    'http_server_requests_total',
    'Total number of HTTP server requests',
    ['method', 'route', 'status_code', 'status_class'],
  );

  return api;
}

function addHttpMetricsHooks(fastify, metrics) {
  fastify.addHook('onRequest', async (request) => {
    request._metricsStart = process.hrtime.bigint();
  });

  fastify.addHook('onResponse', async (request, reply) => {
    if (!request._metricsStart) {
      return;
    }
    const route =
      (request.routeOptions && request.routeOptions.url) ||
      request.routerPath ||
      request.url;
    const statusCode = String(reply.statusCode);
    const statusClass = `${statusCode.charAt(0)}xx`;
    const seconds =
      Number(process.hrtime.bigint() - request._metricsStart) / 1e9;
    metrics.httpDuration.observe(
      { method: request.method, route, status_code: statusCode },
      seconds,
    );
    metrics.httpRequests.inc({
      method: request.method,
      route,
      status_code: statusCode,
      status_class: statusClass,
    });
  });
}

function httpMetricsPlugin(metrics) {
  return async function plugin(fastify) {
    addHttpMetricsHooks(fastify, metrics);
  };
}

function registerMetrics(fastify, metrics) {
  addHttpMetricsHooks(fastify, metrics);
  fastify.get('/metrics', async (request, reply) => {
    reply.header('Content-Type', metrics.contentType);
    return metrics.metricsText();
  });
}

module.exports = {
  createMetrics,
  registerMetrics,
  httpMetricsPlugin,
  addHttpMetricsHooks,
};
