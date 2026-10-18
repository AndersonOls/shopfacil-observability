'use strict';

const { initTelemetry } = require('@shopfacil/telemetry');
const {
  BatchSpanProcessor,
} = require('@opentelemetry/sdk-trace-base');
const {
  createMemoryExporter,
} = require('@shopfacil/telemetry/src/testing');

initTelemetry({
  serviceName: 'gateway-test',
  environment: 'test',
  spanProcessors: [new BatchSpanProcessor(createMemoryExporter())],
});

const test = require('node:test');
const assert = require('node:assert');
const net = require('node:net');
const Fastify = require('fastify');
const { buildApp } = require('../src/app');

function startDownstream() {
  const calls = [];
  const app = Fastify({ logger: false });
  const handler = (request) => {
    calls.push({ url: request.url, headers: request.headers });
    return { ok: true, path: request.url, service: 'downstream' };
  };
  app.route({ method: ['GET', 'POST'], url: '/products', handler });
  app.route({ method: ['GET', 'POST'], url: '/products/*', handler });
  app.route({ method: ['GET', 'POST'], url: '/checkout', handler });
  return { app, calls };
}

test('POST /auth/login returns a token for valid credentials and 401 otherwise', async (t) => {
  const downstream = startDownstream();
  const app = buildApp({
    routes: [{ prefix: '/api/products', target: 'http://127.0.0.1:1' }],
    disableLogger: true,
  });
  t.after(async () => {
    await app.close();
    await downstream.app.close();
  });

  const ok = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { username: 'demo', password: 'demo' },
  });
  assert.strictEqual(ok.statusCode, 200);
  const body = ok.json();
  assert.ok(body.token);
  assert.ok(body.expiresAt);

  const bad = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { username: 'demo', password: 'wrong' },
  });
  assert.strictEqual(bad.statusCode, 401);
  assert.ok(!bad.json().token);
});

test('protected route requires a valid JWT and routes to the service', async (t) => {
  const downstream = startDownstream();
  await downstream.app.listen({ port: 0, host: '127.0.0.1' });
  const { port } = downstream.app.server.address();
  const target = `http://127.0.0.1:${port}`;

  const app = buildApp({
    routes: [{ prefix: '/api/products', target }],
    disableLogger: true,
  });
  t.after(async () => {
    await app.close();
    await downstream.app.close();
  });

  const login = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { username: 'demo', password: 'demo' },
  });
  const { token } = login.json();

  const noToken = await app.inject({ method: 'GET', url: '/api/products' });
  assert.strictEqual(noToken.statusCode, 401);
  assert.strictEqual(downstream.calls.length, 0);

  const invalidToken = await app.inject({
    method: 'GET',
    url: '/api/products',
    headers: { authorization: 'Bearer not-a-real-token' },
  });
  assert.strictEqual(invalidToken.statusCode, 401);
  assert.strictEqual(downstream.calls.length, 0);

  const withToken = await app.inject({
    method: 'GET',
    url: '/api/products',
    headers: { authorization: `Bearer ${token}` },
  });
  assert.strictEqual(withToken.statusCode, 200);
  assert.strictEqual(withToken.json().service, 'downstream');
  assert.strictEqual(downstream.calls.length, 1);
});

function rawHttpRequest({ port, path, headers = {} }) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, '127.0.0.1', () => {
      const lines = [
        `GET ${path} HTTP/1.1`,
        `Host: 127.0.0.1:${port}`,
        'Connection: close',
      ];
      for (const [key, value] of Object.entries(headers)) {
        lines.push(`${key}: ${value}`);
      }
      socket.write(`${lines.join('\r\n')}\r\n\r\n`);
    });
    let data = '';
    socket.on('data', (chunk) => {
      data += chunk.toString();
    });
    socket.on('end', () => resolve(data));
    socket.on('error', reject);
  });
}

test('gateway forwards a matching W3C traceparent header downstream', async (t) => {
  const downstream = startDownstream();
  await downstream.app.listen({ port: 0, host: '127.0.0.1' });
  const { port } = downstream.app.server.address();

  const app = buildApp({
    routes: [{ prefix: '/api/products', target: `http://127.0.0.1:${port}` }],
    disableLogger: true,
  });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const gatewayPort = app.server.address().port;

  t.after(async () => {
    await app.close();
    await downstream.app.close();
  });

  const login = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { username: 'demo', password: 'demo' },
  });
  const { token } = login.json();

  const traceId = '0af7651916cd43dd8448eb211c80319c';
  const spanId = 'b7ad6b7169203331';
  const incoming = `00-${traceId}-${spanId}-01`;

  const raw = await rawHttpRequest({
    port: gatewayPort,
    path: '/api/products',
    headers: {
      traceparent: incoming,
      authorization: `Bearer ${token}`,
    },
  });
  assert.match(raw, /^HTTP\/1\.1 200/);

  assert.strictEqual(downstream.calls.length, 1);
  const forwarded = downstream.calls[0].headers.traceparent;
  assert.ok(forwarded, 'expected a traceparent header downstream');
  assert.ok(
    forwarded.includes(traceId),
    `expected forwarded traceparent to keep trace ${traceId}, got ${forwarded}`,
  );
});

test('GET /health responds 200', async (t) => {
  const downstream = startDownstream();
  const app = buildApp({
    routes: [{ prefix: '/api/products', target: 'http://127.0.0.1:1' }],
    disableLogger: true,
  });
  t.after(async () => {
    await app.close();
    await downstream.app.close();
  });

  const res = await app.inject({ method: 'GET', url: '/health' });
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.json().status, 'ok');
});
