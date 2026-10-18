'use strict';

const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

function request(method, url, { headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const payload = body === undefined ? null : Buffer.from(JSON.stringify(body));
    const requestHeaders = { ...headers, connection: 'close' };
    if (payload) {
      requestHeaders['content-type'] = 'application/json';
      requestHeaders['content-length'] = String(payload.length);
    }
    const req = http.request(
      {
        hostname: target.hostname,
        port: target.port,
        path: `${target.pathname}${target.search}`,
        method,
        headers: requestHeaders,
        agent: false,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk.toString();
        });
        res.on('end', () => {
          let json = null;
          try {
            json = JSON.parse(data);
          } catch (err) {
            json = null;
          }
          resolve({ status: res.statusCode, text: data, json });
        });
      },
    );
    req.on('error', reject);
    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

function attrValue(attributes, key) {
  if (!Array.isArray(attributes)) {
    return undefined;
  }
  const found = attributes.find((a) => a.key === key);
  if (!found || !found.value) {
    return undefined;
  }
  return (
    found.value.stringValue ??
    found.value.intValue ??
    found.value.boolValue ??
    found.value.doubleValue
  );
}

function createOtlpSink() {
  const spans = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        for (const resourceSpans of payload.resourceSpans || []) {
          const service = attrValue(
            resourceSpans.resource && resourceSpans.resource.attributes,
            'service.name',
          );
          for (const scopeSpans of resourceSpans.scopeSpans || []) {
            for (const span of scopeSpans.spans || []) {
              spans.push({
                traceId: span.traceId,
                spanId: span.spanId,
                parentSpanId: span.parentSpanId,
                name: span.name,
                kind: span.kind,
                service,
                target:
                  attrValue(span.attributes, 'url.path') ||
                  attrValue(span.attributes, 'http.target'),
              });
            }
          }
        }
      } catch (err) {
        // ignore malformed payloads
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{}');
    });
  });
  return { server, spans };
}

function startService(scriptPath, env, logs) {
  const child = spawn(process.execPath, [scriptPath], {
    cwd: PROJECT_ROOT,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (chunk) => logs.push(chunk.toString()));
  child.stderr.on('data', (chunk) => logs.push(chunk.toString()));
  return child;
}

async function stopService(child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }
  child.kill('SIGTERM');
  const exited = await Promise.race([
    once(child, 'exit').then(() => true),
    delay(1500).then(() => false),
  ]);
  if (!exited) {
    child.kill('SIGKILL');
    await once(child, 'exit').catch(() => {});
  }
}

async function waitForHealth(url, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await request('GET', url);
      if (res.status === 200) {
        return;
      }
    } catch (err) {
      // not ready yet
    }
    await delay(150);
  }
  throw new Error(`service at ${url} did not become healthy`);
}

function parseLogRecords(chunks) {
  const records = [];
  for (const raw of chunks.join('').split('\n')) {
    const line = raw.trim();
    if (!line.startsWith('{')) {
      continue;
    }
    try {
      records.push(JSON.parse(line));
    } catch (err) {
      // not a JSON log line
    }
  }
  return records;
}

test(
  'a checkout produces one trace across all services with correlated logs',
  { timeout: 120000 },
  async (t) => {
    const sink = createOtlpSink();
    await new Promise((resolve) => sink.server.listen(0, '127.0.0.1', resolve));
    const sinkPort = sink.server.address().port;
    const sinkUrl = `http://127.0.0.1:${sinkPort}/v1/traces`;

    const [catalogPort, inventoryPort, paymentPort, externalPort, ordersPort, gatewayPort] =
      await Promise.all([0, 1, 2, 3, 4, 5].map(() => getFreePort()));

    const common = {
      HOST: '127.0.0.1',
      DEPLOYMENT_ENVIRONMENT: 'test',
      OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: sinkUrl,
      OTEL_BSP_SCHEDULE_DELAY: '200',
      OTEL_BSP_MAX_EXPORT_BATCH_SIZE: '64',
      LOG_LEVEL: 'info',
    };

    const logs = [];
    const children = [];

    children.push(
      startService(
        'services/catalog/src/server.js',
        { ...common, PORT: String(catalogPort), OTEL_SERVICE_NAME: 'catalog' },
        logs,
      ),
    );
    children.push(
      startService(
        'services/inventory/src/server.js',
        { ...common, PORT: String(inventoryPort), OTEL_SERVICE_NAME: 'inventory' },
        logs,
      ),
    );
    children.push(
      startService(
        'services/payment/src/server.js',
        {
          ...common,
          PORT: String(paymentPort),
          EXTERNAL_GATEWAY_PORT: String(externalPort),
          EXTERNAL_GATEWAY_URL: `http://127.0.0.1:${externalPort}`,
          EXTERNAL_GATEWAY_FAILURE_RATE: '0',
          OTEL_SERVICE_NAME: 'payment',
        },
        logs,
      ),
    );
    children.push(
      startService(
        'services/orders/src/server.js',
        {
          ...common,
          PORT: String(ordersPort),
          INVENTORY_URL: `http://127.0.0.1:${inventoryPort}`,
          PAYMENT_URL: `http://127.0.0.1:${paymentPort}`,
          OTEL_SERVICE_NAME: 'orders',
        },
        logs,
      ),
    );
    children.push(
      startService(
        'gateway/src/server.js',
        {
          ...common,
          PORT: String(gatewayPort),
          CATALOG_URL: `http://127.0.0.1:${catalogPort}`,
          INVENTORY_URL: `http://127.0.0.1:${inventoryPort}`,
          PAYMENT_URL: `http://127.0.0.1:${paymentPort}`,
          ORDERS_URL: `http://127.0.0.1:${ordersPort}`,
          OTEL_SERVICE_NAME: 'gateway',
        },
        logs,
      ),
    );

    t.after(async () => {
      await Promise.all(children.map(stopService));
      sink.server.closeAllConnections();
      await new Promise((resolve) => sink.server.close(resolve));
    });

    await Promise.all([
      waitForHealth(`http://127.0.0.1:${catalogPort}/health`),
      waitForHealth(`http://127.0.0.1:${inventoryPort}/health`),
      waitForHealth(`http://127.0.0.1:${paymentPort}/health`),
      waitForHealth(`http://127.0.0.1:${ordersPort}/health`),
      waitForHealth(`http://127.0.0.1:${gatewayPort}/health`),
    ]);

    const traceId = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1';
    const spanId = 'bbbbbbbbbbbbbbb1';

    const login = await request('POST', `http://127.0.0.1:${gatewayPort}/auth/login`, {
      body: { username: 'demo', password: 'demo' },
    });
    assert.strictEqual(login.status, 200);
    const { token } = login.json;

    const checkout = await request('POST', `http://127.0.0.1:${gatewayPort}/api/checkout`, {
      headers: {
        authorization: `Bearer ${token}`,
        traceparent: `00-${traceId}-${spanId}-01`,
      },
      body: {
        orderId: 'e2e-order-1',
        items: [{ productId: 1, quantity: 2 }],
        amount: 299.8,
      },
    });
    assert.strictEqual(checkout.status, 200, checkout.text);
    assert.strictEqual(checkout.json.status, 'approved');

    const products = await request('GET', `http://127.0.0.1:${gatewayPort}/api/products`, {
      headers: {
        authorization: `Bearer ${token}`,
        traceparent: `00-${traceId}-ccccccccccccccc1-01`,
      },
    });
    assert.strictEqual(products.status, 200, products.text);

    await delay(1500);

    const checkoutSpans = sink.spans.filter((s) => s.traceId === traceId);
    const targets = checkoutSpans.map((s) => s.target);
    const services = new Set(checkoutSpans.map((s) => s.service));

    assert.ok(
      targets.some((target) => target && target.startsWith('/api/checkout')),
      `expected a gateway span for /api/checkout, got ${JSON.stringify(targets)}`,
    );
    assert.ok(
      targets.includes('/checkout'),
      `expected an orders span for /checkout, got ${JSON.stringify(targets)}`,
    );
    assert.ok(
      targets.includes('/inventory/reserve'),
      `expected an inventory span for /inventory/reserve, got ${JSON.stringify(targets)}`,
    );
    assert.ok(
      targets.includes('/payments'),
      `expected a payment span for /payments, got ${JSON.stringify(targets)}`,
    );
    assert.ok(
      targets.includes('/charge'),
      `expected an external gateway span for /charge, got ${JSON.stringify(targets)}`,
    );

    for (const expected of ['gateway', 'orders', 'inventory', 'payment']) {
      assert.ok(
        services.has(expected),
        `expected spans from service ${expected}, got ${JSON.stringify([...services])}`,
      );
    }

    const records = parseLogRecords(logs);
    const correlated = records.filter((r) => r.trace_id === traceId);
    const correlatedServices = new Set(correlated.map((r) => r.service));
    for (const expected of ['gateway', 'orders', 'inventory', 'payment', 'catalog']) {
      assert.ok(
        correlatedServices.has(expected),
        `expected correlated logs from ${expected}, got ${JSON.stringify([...correlatedServices])}`,
      );
    }
    assert.ok(
      correlated.every((r) => typeof r.span_id === 'string' && r.span_id.length > 0),
      'expected every correlated log to include span_id',
    );
  },
);
