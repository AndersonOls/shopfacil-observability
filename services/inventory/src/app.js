'use strict';

const Fastify = require('fastify');
const {
  createLogger,
  createMetrics,
  registerMetrics,
} = require('@shopfacil/telemetry');
const { createInventoryDb } = require('./db');

const SERVICE_NAME = 'inventory';

function buildApp(options = {}) {
  const logger = options.logger || createLogger({ service: SERVICE_NAME });
  const fastifyOptions = options.disableLogger
    ? { logger: false }
    : { logger };
  const app = Fastify(fastifyOptions);

  const metrics = createMetrics(SERVICE_NAME);
  const dbGauge = metrics.createGauge(
    'db_active_connections',
    'Active database connections',
  );
  registerMetrics(app, metrics);

  const inventory = options.inventory || createInventoryDb(options.dbPath);
  dbGauge.set(1);

  app.get('/health', async () => ({ status: 'ok', service: SERVICE_NAME }));

  app.post('/inventory/reserve', async (request, reply) => {
    const productId = Number(request.body && request.body.productId);
    const quantity = Number(request.body && request.body.quantity);
    if (!Number.isInteger(productId) || !Number.isInteger(quantity) || quantity <= 0) {
      reply.code(400);
      return { error: 'invalid_request', message: 'productId and quantity are required' };
    }

    const result = inventory.reserve(productId, quantity);
    if (!result.ok) {
      reply.code(409);
      return {
        error: result.reason,
        message:
          result.reason === 'product_not_found'
            ? `product ${productId} not found`
            : `insufficient stock for product ${productId}`,
        available: result.available,
      };
    }
    return result;
  });

  app.post('/inventory/release', async (request, reply) => {
    const reservationId = request.body && request.body.reservationId;
    if (!reservationId) {
      reply.code(400);
      return { error: 'invalid_request', message: 'reservationId is required' };
    }
    const result = inventory.release(reservationId);
    return result;
  });

  app.addHook('onClose', async () => {
    dbGauge.set(0);
    if (!options.inventory) {
      inventory.close();
    }
  });

  app.decorate('inventoryDb', inventory);
  return app;
}

module.exports = { buildApp, SERVICE_NAME };
