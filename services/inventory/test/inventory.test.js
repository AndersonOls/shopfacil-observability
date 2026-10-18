'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { buildApp } = require('../src/app');
const { createInventoryDb } = require('../src/db');

function buildTestApp() {
  const inventory = createInventoryDb(':memory:');
  const app = buildApp({ inventory, disableLogger: true });
  return { app, inventory };
}

test('POST /inventory/reserve decrements stock and returns an id', async (t) => {
  const { app, inventory } = buildTestApp();
  t.after(async () => {
    await app.close();
    inventory.close();
  });

  const before = inventory.getStock(1).available;
  const res = await app.inject({
    method: 'POST',
    url: '/inventory/reserve',
    payload: { productId: 1, quantity: 3 },
  });

  assert.strictEqual(res.statusCode, 200);
  const body = res.json();
  assert.ok(body.reservationId);
  assert.strictEqual(body.quantity, 3);
  assert.strictEqual(body.remaining, before - 3);
  assert.strictEqual(inventory.getStock(1).available, before - 3);
});

test('POST /inventory/reserve rejects when stock is insufficient (409, no change)', async (t) => {
  const { app, inventory } = buildTestApp();
  t.after(async () => {
    await app.close();
    inventory.close();
  });

  const before = inventory.getStock(3).available;
  const res = await app.inject({
    method: 'POST',
    url: '/inventory/reserve',
    payload: { productId: 3, quantity: before + 1000 },
  });

  assert.strictEqual(res.statusCode, 409);
  assert.strictEqual(res.json().error, 'insufficient_stock');
  assert.strictEqual(inventory.getStock(3).available, before);
});

test('POST /inventory/release returns units to stock', async (t) => {
  const { app, inventory } = buildTestApp();
  t.after(async () => {
    await app.close();
    inventory.close();
  });

  const initial = inventory.getStock(2).available;
  const reserve = await app.inject({
    method: 'POST',
    url: '/inventory/reserve',
    payload: { productId: 2, quantity: 5 },
  });
  const { reservationId } = reserve.json();
  assert.strictEqual(inventory.getStock(2).available, initial - 5);

  const release = await app.inject({
    method: 'POST',
    url: '/inventory/release',
    payload: { reservationId },
  });

  assert.strictEqual(release.statusCode, 200);
  assert.strictEqual(release.json().status, 'released');
  assert.strictEqual(inventory.getStock(2).available, initial);
});

test('POST /inventory/release is idempotent', async (t) => {
  const { app, inventory } = buildTestApp();
  t.after(async () => {
    await app.close();
    inventory.close();
  });

  const initial = inventory.getStock(4).available;
  const reserve = await app.inject({
    method: 'POST',
    url: '/inventory/reserve',
    payload: { productId: 4, quantity: 2 },
  });
  const { reservationId } = reserve.json();

  const first = await app.inject({
    method: 'POST',
    url: '/inventory/release',
    payload: { reservationId },
  });
  const second = await app.inject({
    method: 'POST',
    url: '/inventory/release',
    payload: { reservationId },
  });

  assert.strictEqual(first.statusCode, 200);
  assert.strictEqual(second.statusCode, 200);
  assert.strictEqual(second.json().status, 'noop');
  assert.strictEqual(inventory.getStock(4).available, initial);
});

test('POST /inventory/release of an unknown reservation is safe', async (t) => {
  const { app, inventory } = buildTestApp();
  t.after(async () => {
    await app.close();
    inventory.close();
  });

  const res = await app.inject({
    method: 'POST',
    url: '/inventory/release',
    payload: { reservationId: 'does-not-exist' },
  });
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.json().status, 'noop');
});
