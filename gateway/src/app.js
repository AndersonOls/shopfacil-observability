'use strict';

const Fastify = require('fastify');
const {
  createLogger,
  createMetrics,
  registerMetrics,
} = require('@shopfacil/telemetry');
const { authenticate, verifyToken } = require('./auth');

const SERVICE_NAME = 'gateway';

const DEFAULT_ROUTES = [
  { prefix: '/api/products', target: process.env.CATALOG_URL || 'http://localhost:3001' },
  { prefix: '/api/inventory', target: process.env.INVENTORY_URL || 'http://localhost:3002' },
  { prefix: '/api/payments', target: process.env.PAYMENT_URL || 'http://localhost:3003' },
  { prefix: '/api/checkout', target: process.env.ORDERS_URL || 'http://localhost:3004' },
];

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

function buildApp(options = {}) {
  const logger = options.logger || createLogger({ service: SERVICE_NAME });
  const fastifyOptions = options.disableLogger
    ? { logger: false }
    : { logger };
  const app = Fastify(fastifyOptions);

  const metrics = createMetrics(SERVICE_NAME);
  registerMetrics(app, metrics);

  const routes = options.routes || DEFAULT_ROUTES;

  async function authPreHandler(request, reply) {
    const header = request.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token || !verifyToken(token)) {
      reply.code(401);
      reply.send({ error: 'unauthorized', message: 'missing or invalid token' });
    }
  }

  async function forward(request, reply, route) {
    const path = request.url.replace(/^\/api/, '');
    const target = `${route.target.replace(/\/$/, '')}${path}`;

    const headers = { ...request.headers };
    delete headers.host;
    delete headers['content-length'];
    delete headers.traceparent;
    delete headers.tracestate;
    delete headers.baggage;

    const hasBody =
      !['GET', 'HEAD', 'DELETE'].includes(request.method) && request.body;

    const upstream = await fetch(target, {
      method: request.method,
      headers,
      body: hasBody ? JSON.stringify(request.body) : undefined,
    });
    const text = await upstream.text();

    reply.code(upstream.status);
    const contentType = upstream.headers.get('content-type');
    if (contentType) {
      reply.header('content-type', contentType);
    }
    return reply.send(text);
  }

  app.get('/health', async () => ({ status: 'ok', service: SERVICE_NAME }));

  app.post('/auth/login', async (request, reply) => {
    const body = request.body || {};
    const { username, password } = body;
    const result = authenticate(username, password);

    if (!result) {
      request.log.warn(
        { event: 'login', outcome: 'failed', user_id: username },
        'login failed',
      );
      reply.code(401);
      return {
        error: 'invalid_credentials',
        message: 'invalid username or password',
      };
    }

    request.log.info(
      { event: 'login', outcome: 'success', user_id: username },
      'login succeeded',
    );
    return {
      token: result.token,
      tokenType: 'Bearer',
      expiresAt: result.expiresAt,
      expiresIn: result.expiresIn,
    };
  });

  for (const route of routes) {
    for (const url of [route.prefix, `${route.prefix}/*`]) {
      app.route({
        method: METHODS,
        url,
        preHandler: authPreHandler,
        handler: (request, reply) => forward(request, reply, route),
      });
    }
  }

  return app;
}

module.exports = { buildApp, SERVICE_NAME, DEFAULT_ROUTES };
