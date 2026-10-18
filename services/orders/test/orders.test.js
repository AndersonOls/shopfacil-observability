'use strict';

const test = require('node:test');
const assert = require('node:assert');
const Fastify = require('fastify');
const { buildApp } = require('../src/app');
const { buildApp: buildInventoryApp } = require('@shopfacil/inventory/src/app');
const {
  createInventoryDb,
} = require('@shopfacil/inventory/src/db');

async function startInventory() {
  const inventory = createInventoryDb(':memory:');
  const app = buildInventoryApp({ inventory, disableLogger: true });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const { port } = app.server.address();
  return { app, inventory, url: `http://127.0.0.1:${port}` };
}

async function startPaymentStub(outcome) {
  const calls = [];
  const app = Fastify({ logger: false });
  app.post('/payments', async (request) => {
    calls.push(request.body);
    const resolved =
      typeof outcome === 'function' ? outcome(request.body) : outcome;
    if (resolved === 'approved') {
      return { status: 'approved', gatewayReference: 'ext_stub_1' };
    }
    return { status: 'declined', reason: 'insufficient_funds' };
  });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const { port } = app.server.address();
  return { app, calls, url: `http://127.0.0.1:${port}` };
}

test('successful checkout reserves stock and approves payment', async (t) => {
  const inventory = await startInventory();
  const payment = await startPaymentStub('approved');
  const app = buildApp({
    inventoryUrl: inventory.url,
    paymentUrl: payment.url,
    disableLogger: true,
  });
  t.after(async () => {
    await app.close();
    await inventory.app.close();
    inventory.inventory.close();
    await payment.app.close();
  });

  const before = inventory.inventory.getStock(1).available;
  const res = await app.inject({
    method: 'POST',
    url: '/checkout',
    payload: { orderId: 'o1', productId: 1, quantity: 2, amount: 299.8 },
  });

  assert.strictEqual(res.statusCode, 200);
  const body = res.json();
  assert.strictEqual(body.status, 'approved');
  assert.strictEqual(inventory.inventory.getStock(1).available, before - 2);
  assert.ok(payment.calls.length === 1);
});

test('checkout without stock fails and does not call payment', async (t) => {
  const inventory = await startInventory();
  const payment = await startPaymentStub('approved');
  const app = buildApp({
    inventoryUrl: inventory.url,
    paymentUrl: payment.url,
    disableLogger: true,
  });
  t.after(async () => {
    await app.close();
    await inventory.app.close();
    inventory.inventory.close();
    await payment.app.close();
  });

  const res = await app.inject({
    method: 'POST',
    url: '/checkout',
    payload: { orderId: 'o2', productId: 1, quantity: 999999, amount: 10 },
  });

  assert.strictEqual(res.statusCode, 409);
  assert.strictEqual(res.json().reason, 'out_of_stock');
  assert.strictEqual(payment.calls.length, 0);
  assert.ok(!res.json().steps.includes('payment.charge'));
});

test('payment failure compensates by releasing the reservation', async (t) => {
  const inventory = await startInventory();
  const payment = await startPaymentStub('declined');
  const app = buildApp({
    inventoryUrl: inventory.url,
    paymentUrl: payment.url,
    disableLogger: true,
  });
  t.after(async () => {
    await app.close();
    await inventory.app.close();
    inventory.inventory.close();
    await payment.app.close();
  });

  const before = inventory.inventory.getStock(2).available;
  const res = await app.inject({
    method: 'POST',
    url: '/checkout',
    payload: { orderId: 'o3', productId: 2, quantity: 3, amount: 100 },
  });

  assert.strictEqual(res.statusCode, 402);
  const body = res.json();
  assert.strictEqual(body.reason, 'payment_failed');
  assert.strictEqual(inventory.inventory.getStock(2).available, before);
});

test('checkout returns the executed steps in order', async (t) => {
  const inventory = await startInventory();
  const payment = await startPaymentStub((body) =>
    body.orderId === 'o5' ? 'declined' : 'approved',
  );
  const app = buildApp({
    inventoryUrl: inventory.url,
    paymentUrl: payment.url,
    disableLogger: true,
  });
  t.after(async () => {
    await app.close();
    await inventory.app.close();
    inventory.inventory.close();
    await payment.app.close();
  });

  const success = await app.inject({
    method: 'POST',
    url: '/checkout',
    payload: { orderId: 'o4', productId: 1, quantity: 1, amount: 149.9 },
  });
  assert.deepStrictEqual(success.json().steps, [
    'inventory.reserve',
    'payment.charge',
    'completed',
  ]);

  const failure = await app.inject({
    method: 'POST',
    url: '/checkout',
    payload: { orderId: 'o5', productId: 6, quantity: 1, amount: 249 },
  });
  assert.deepStrictEqual(failure.json().steps, [
    'inventory.reserve',
    'payment.charge',
    'inventory.release',
  ]);
});
