'use strict';

const Fastify = require('fastify');
const {
  createLogger,
  createMetrics,
  registerMetrics,
} = require('@shopfacil/telemetry');
const { createCatalogDb } = require('./db');

const SERVICE_NAME = 'catalog';

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

  const catalog = options.catalog || createCatalogDb(options.dbPath);
  dbGauge.set(1);

  app.get('/health', async () => ({ status: 'ok', service: SERVICE_NAME }));

  app.get('/products', async (request) => {
    const products = catalog.listProducts(request.query.q);
    return { products, count: products.length };
  });

  app.get('/products/:id', async (request, reply) => {
    const id = Number(request.params.id);
    const product = catalog.getProduct(id);
    if (!product) {
      reply.code(404);
      return { error: 'not_found', message: `product ${id} not found` };
    }
    return product;
  });

  app.addHook('onClose', async () => {
    dbGauge.set(0);
    if (!options.catalog) {
      catalog.close();
    }
  });

  app.decorate('catalogDb', catalog);
  return app;
}

module.exports = { buildApp, SERVICE_NAME };
