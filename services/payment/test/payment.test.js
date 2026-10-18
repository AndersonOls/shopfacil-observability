'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { buildApp } = require('../src/app');
const { buildExternalGateway } = require('../src/external-gateway');

async function startGateway(config) {
  const gateway = buildExternalGateway(config);
  await gateway.listen({ port: 0, host: '127.0.0.1' });
  const { port } = gateway.server.address();
  return { gateway, url: `http://127.0.0.1:${port}` };
}

test('approves a valid payment with a gateway reference', async (t) => {
  const { gateway, url } = await startGateway({ latencyMs: 0, failureRate: 0 });
  const app = buildApp({ gatewayUrl: url, disableLogger: true });
  t.after(async () => {
    await app.close();
    await gateway.close();
  });

  const res = await app.inject({
    method: 'POST',
    url: '/payments',
    payload: { orderId: 'order-1', amount: 149.9 },
  });

  assert.strictEqual(res.statusCode, 200);
  const body = res.json();
  assert.strictEqual(body.status, 'approved');
  assert.ok(body.gatewayReference);

  const metrics = await app.inject({ method: 'GET', url: '/metrics' });
  assert.match(metrics.body, /payment_outcome_total/);
});

test('declines when the external gateway declines', async (t) => {
  const { gateway, url } = await startGateway({ latencyMs: 0, failureRate: 1 });
  const app = buildApp({ gatewayUrl: url, disableLogger: true });
  t.after(async () => {
    await app.close();
    await gateway.close();
  });

  const res = await app.inject({
    method: 'POST',
    url: '/payments',
    payload: { orderId: 'order-2', amount: 100 },
  });

  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.json().status, 'declined');
});

test('reports failure (not approved) when the gateway times out', async (t) => {
  const { gateway, url } = await startGateway({ latencyMs: 300, failureRate: 0 });
  const app = buildApp({ gatewayUrl: url, timeoutMs: 50, disableLogger: true });
  t.after(async () => {
    await app.close();
    await gateway.close();
  });

  const res = await app.inject({
    method: 'POST',
    url: '/payments',
    payload: { orderId: 'order-3', amount: 200 },
  });

  assert.strictEqual(res.statusCode, 502);
  const body = res.json();
  assert.strictEqual(body.status, 'failed');
  assert.notStrictEqual(body.status, 'approved');
});

test('reports failure (not approved) when the gateway is unavailable', async (t) => {
  const app = buildApp({
    gatewayUrl: 'http://127.0.0.1:1',
    timeoutMs: 200,
    disableLogger: true,
  });
  t.after(async () => {
    await app.close();
  });

  const res = await app.inject({
    method: 'POST',
    url: '/payments',
    payload: { orderId: 'order-4', amount: 50 },
  });

  assert.strictEqual(res.statusCode, 502);
  const body = res.json();
  assert.strictEqual(body.status, 'failed');
});

test('external gateway honors injected latency and health', async (t) => {
  const { gateway, url } = await startGateway({ latencyMs: 150, failureRate: 0 });
  t.after(async () => {
    await gateway.close();
  });

  const started = Date.now();
  const charge = await gateway.inject({
    method: 'POST',
    url: '/charge',
    payload: { orderId: 'x', amount: 1 },
  });
  const elapsed = Date.now() - started;

  assert.strictEqual(charge.statusCode, 200);
  assert.ok(elapsed >= 140, `expected latency >= 140ms, got ${elapsed}ms`);

  const health = await gateway.inject({ method: 'GET', url: '/health' });
  assert.strictEqual(health.statusCode, 200);
  assert.ok(url.startsWith('http://127.0.0.1:'));
});
