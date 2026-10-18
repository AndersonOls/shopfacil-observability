'use strict';

const Fastify = require('fastify');

function buildExternalGateway(config = {}) {
  const latencyMs = Number(config.latencyMs || 0);
  const failureRate = Number(config.failureRate || 0);
  const app = Fastify({ logger: false });

  app.get('/health', async () => ({ status: 'ok', service: 'external-gateway' }));

  app.post('/charge', async (request, reply) => {
    if (latencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, latencyMs));
    }

    if (Math.random() < failureRate) {
      reply.code(402);
      return { status: 'declined', reason: 'insufficient_funds' };
    }

    return {
      status: 'approved',
      reference: `ext_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      amount: request.body && request.body.amount,
    };
  });

  return app;
}

module.exports = { buildExternalGateway };
