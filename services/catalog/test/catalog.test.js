'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { buildApp } = require('../src/app');
const { createCatalogDb } = require('../src/db');

function buildTestApp() {
  const catalog = createCatalogDb(':memory:');
  const app = buildApp({ catalog, disableLogger: true });
  return { app, catalog };
}

test('GET /products returns the seeded product list', async (t) => {
  const { app, catalog } = buildTestApp();
  t.after(async () => {
    await app.close();
    catalog.close();
  });

  const res = await app.inject({ method: 'GET', url: '/products' });
  assert.strictEqual(res.statusCode, 200);
  const body = res.json();
  assert.ok(Array.isArray(body.products));
  assert.ok(body.products.length >= 6);
  assert.ok(body.products.every((p) => 'id' in p && 'name' in p && 'price' in p));
});

test('GET /products?q=mouse matches case-insensitively', async (t) => {
  const { app, catalog } = buildTestApp();
  t.after(async () => {
    await app.close();
    catalog.close();
  });

  const res = await app.inject({ method: 'GET', url: '/products?q=mouse' });
  assert.strictEqual(res.statusCode, 200);
  const body = res.json();
  assert.ok(body.products.length >= 1);
  assert.ok(body.products.every((p) => p.name.toLowerCase().includes('mouse')));
});

test('GET /products?q= with no matches returns an empty list', async (t) => {
  const { app, catalog } = buildTestApp();
  t.after(async () => {
    await app.close();
    catalog.close();
  });

  const res = await app.inject({
    method: 'GET',
    url: '/products?q=inexistente-xyz',
  });
  assert.strictEqual(res.statusCode, 200);
  assert.deepStrictEqual(res.json().products, []);
});

test('GET /products/:id returns 404 for an unknown product', async (t) => {
  const { app, catalog } = buildTestApp();
  t.after(async () => {
    await app.close();
    catalog.close();
  });

  const res = await app.inject({ method: 'GET', url: '/products/9999' });
  assert.strictEqual(res.statusCode, 404);
});

test('GET /products/:id returns the product when it exists', async (t) => {
  const { app, catalog } = buildTestApp();
  t.after(async () => {
    await app.close();
    catalog.close();
  });

  const res = await app.inject({ method: 'GET', url: '/products/1' });
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.json().id, 1);
});

test('GET /health responds 200 and /metrics exposes series', async (t) => {
  const { app, catalog } = buildTestApp();
  t.after(async () => {
    await app.close();
    catalog.close();
  });

  const health = await app.inject({ method: 'GET', url: '/health' });
  assert.strictEqual(health.statusCode, 200);

  await app.inject({ method: 'GET', url: '/products' });
  const metrics = await app.inject({ method: 'GET', url: '/metrics' });
  assert.strictEqual(metrics.statusCode, 200);
  assert.match(metrics.body, /http_server_request_duration_seconds/);
  assert.match(metrics.body, /db_active_connections/);
});
