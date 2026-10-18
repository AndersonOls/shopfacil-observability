'use strict';

const Fastify = require('fastify');
const {
  createLogger,
  createMetrics,
  registerMetrics,
} = require('@shopfacil/telemetry');

const SERVICE_NAME = 'orders';

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  let body = null;
  try {
    body = await response.json();
  } catch (err) {
    body = null;
  }
  return { ok: response.ok, status: response.status, body };
}

function buildApp(options = {}) {
  const logger = options.logger || createLogger({ service: SERVICE_NAME });
  const fastifyOptions = options.disableLogger
    ? { logger: false }
    : { logger };
  const app = Fastify(fastifyOptions);

  const metrics = createMetrics(SERVICE_NAME);
  const checkoutDuration = metrics.createHistogram(
    'checkout_duration_seconds',
    'End-to-end checkout duration in seconds',
    [],
    [0.05, 0.1, 0.25, 0.5, 1, 2, 5],
  );
  registerMetrics(app, metrics);

  const inventoryUrl = (
    options.inventoryUrl ||
    process.env.INVENTORY_URL ||
    'http://localhost:3002'
  ).replace(/\/$/, '');
  const paymentUrl = (
    options.paymentUrl ||
    process.env.PAYMENT_URL ||
    'http://localhost:3003'
  ).replace(/\/$/, '');

  const toItems = (body) => {
    if (Array.isArray(body.items) && body.items.length > 0) {
      return body.items;
    }
    if (body.productId != null) {
      return [{ productId: body.productId, quantity: body.quantity }];
    }
    return [];
  };

  app.get('/health', async () => ({ status: 'ok', service: SERVICE_NAME }));

  app.post('/checkout', async (request, reply) => {
    const body = request.body || {};
    const orderId = body.orderId || `order-${Date.now()}`;
    const items = toItems(body);
    const steps = [];
    const reservations = [];
    const stopTimer = checkoutDuration.startTimer();

    if (items.length === 0) {
      stopTimer();
      reply.code(400);
      return { error: 'invalid_request', message: 'items are required' };
    }

    steps.push('inventory.reserve');
    for (const item of items) {
      const reserve = await postJson(`${inventoryUrl}/inventory/reserve`, {
        productId: item.productId,
        quantity: item.quantity,
      });
      if (!reserve.ok) {
        if (reservations.length > 0) {
          steps.push('inventory.release');
          for (const reservation of reservations) {
            await postJson(`${inventoryUrl}/inventory/release`, {
              reservationId: reservation.reservationId,
            });
          }
        }
        stopTimer();
        reply.code(409);
        return {
          status: 'failed',
          reason: 'out_of_stock',
          orderId,
          steps,
          detail: reserve.body,
        };
      }
      reservations.push(reserve.body);
    }

    steps.push('payment.charge');
    const payment = await postJson(`${paymentUrl}/payments`, {
      orderId,
      amount: body.amount,
    });

    if (payment.ok && payment.body && payment.body.status === 'approved') {
      steps.push('completed');
      stopTimer();
      return {
        status: 'approved',
        orderId,
        steps,
        reservationIds: reservations.map((r) => r.reservationId),
        payment: payment.body,
      };
    }

    steps.push('inventory.release');
    for (const reservation of reservations) {
      await postJson(`${inventoryUrl}/inventory/release`, {
        reservationId: reservation.reservationId,
      });
    }
    stopTimer();
    reply.code(402);
    return {
      status: 'failed',
      reason: 'payment_failed',
      orderId,
      steps,
      payment: payment.body,
    };
  });

  app.decorate('ordersConfig', { inventoryUrl, paymentUrl });
  return app;
}

module.exports = { buildApp, SERVICE_NAME };
