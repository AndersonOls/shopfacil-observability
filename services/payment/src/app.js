'use strict';

const Fastify = require('fastify');
const {
  createLogger,
  createMetrics,
  registerMetrics,
} = require('@shopfacil/telemetry');

const SERVICE_NAME = 'payment';

function buildApp(options = {}) {
  const logger = options.logger || createLogger({ service: SERVICE_NAME });
  const fastifyOptions = options.disableLogger
    ? { logger: false }
    : { logger };
  const app = Fastify(fastifyOptions);

  const metrics = createMetrics(SERVICE_NAME);
  const paymentOutcome = metrics.createCounter(
    'payment_outcome_total',
    'Payment outcomes by result',
    ['outcome'],
  );
  const gatewayFailures = metrics.createCounter(
    'external_gateway_failures_total',
    'Total external gateway failures',
  );
  registerMetrics(app, metrics);

  const gatewayUrl =
    options.gatewayUrl ||
    process.env.EXTERNAL_GATEWAY_URL ||
    'http://localhost:4090';
  const timeoutMs = Number(
    options.timeoutMs ??
      process.env.EXTERNAL_GATEWAY_TIMEOUT_MS ??
      2000,
  );

  app.get('/health', async () => ({ status: 'ok', service: SERVICE_NAME }));

  app.post('/payments', async (request, reply) => {
    const body = request.body || {};
    const orderId = body.orderId;
    const amount = body.amount;
    if (!orderId || amount == null) {
      reply.code(400);
      return { error: 'invalid_request', message: 'orderId and amount are required' };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${gatewayUrl.replace(/\/$/, '')}/charge`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ orderId, amount }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      const gatewayBody = await response.json();

      if (response.ok && gatewayBody.status === 'approved') {
        paymentOutcome.inc({ outcome: 'approved' });
        return {
          status: 'approved',
          orderId,
          amount,
          gatewayReference: gatewayBody.reference,
        };
      }

      paymentOutcome.inc({ outcome: 'declined' });
      return {
        status: 'declined',
        orderId,
        amount,
        reason: gatewayBody.reason || 'declined',
      };
    } catch (err) {
      clearTimeout(timer);
      gatewayFailures.inc();
      paymentOutcome.inc({ outcome: 'failed' });
      reply.code(502);
      return {
        status: 'failed',
        orderId,
        amount,
        reason: 'gateway_unavailable',
        error: err.name,
      };
    }
  });

  app.decorate('paymentConfig', { gatewayUrl, timeoutMs });
  return app;
}

module.exports = { buildApp, SERVICE_NAME };
