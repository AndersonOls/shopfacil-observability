'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { Writable } = require('node:stream');
const {
  BatchSpanProcessor,
} = require('@opentelemetry/sdk-trace-base');
const { trace } = require('@opentelemetry/api');

const { initTelemetry } = require('../src/telemetry');
const { createLogger } = require('../src/logger');
const { createMemoryExporter } = require('../src/testing');

initTelemetry({
  serviceName: 'logger-test',
  environment: 'test',
  spanProcessors: [new BatchSpanProcessor(createMemoryExporter())],
});

function captureStream() {
  const lines = [];
  const stream = new Writable({
    write(chunk, encoding, callback) {
      lines.push(chunk.toString());
      callback();
    },
  });
  return {
    stream,
    records() {
      return lines
        .join('')
        .split('\n')
        .filter((line) => line.trim().length > 0)
        .map((line) => JSON.parse(line));
    },
  };
}

test('emits JSON records with the required fields', () => {
  const capture = captureStream();
  const logger = createLogger({ service: 'catalog', stream: capture.stream });
  logger.info({ event: 'http.request' }, 'hello');

  const [record] = capture.records();
  assert.strictEqual(record.level, 30);
  assert.strictEqual(record.service, 'catalog');
  assert.strictEqual(record.message, 'hello');
  assert.strictEqual(record.event, 'http.request');
  assert.ok(typeof record.timestamp === 'string');
  assert.ok(!Number.isNaN(Date.parse(record.timestamp)));
});

test('masks password, token and card data', () => {
  const capture = captureStream();
  const logger = createLogger({ service: 'gateway', stream: capture.stream });
  logger.info(
    {
      password: 'super-secret',
      token: 'jwt-token-value',
      cardNumber: '4111111111111111',
      authorization: 'Bearer abc',
      nested: { password: 'nested-secret', card: '5555444433332222' },
    },
    'masked',
  );

  const [record] = capture.records();
  const serialized = JSON.stringify(record);
  assert.strictEqual(record.password, '[Redacted]');
  assert.strictEqual(record.token, '[Redacted]');
  assert.strictEqual(record.cardNumber, '[Redacted]');
  assert.strictEqual(record.authorization, '[Redacted]');
  assert.strictEqual(record.nested.password, '[Redacted]');
  assert.strictEqual(record.nested.card, '[Redacted]');
  assert.ok(!serialized.includes('super-secret'));
  assert.ok(!serialized.includes('jwt-token-value'));
  assert.ok(!serialized.includes('4111111111111111'));
  assert.ok(!serialized.includes('nested-secret'));
});

test('injects active trace_id and span_id', () => {
  const capture = captureStream();
  const logger = createLogger({ service: 'orders', stream: capture.stream });
  const tracer = trace.getTracer('logger-test');

  let spanContext;
  const span = tracer.startSpan('checkout');
  spanContext = span.spanContext();
  const { context } = require('@opentelemetry/api');
  context.with(trace.setSpan(context.active(), span), () => {
    logger.info({ event: 'checkout.step' }, 'inside span');
  });
  span.end();

  const [record] = capture.records();
  assert.strictEqual(record.trace_id, spanContext.traceId);
  assert.strictEqual(record.span_id, spanContext.spanId);
  assert.ok(record.trace_id.length === 32);
});
