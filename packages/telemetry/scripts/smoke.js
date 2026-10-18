'use strict';

const assert = require('node:assert');
const { BatchSpanProcessor } = require('@opentelemetry/sdk-trace-base');
const { initTelemetry } = require('../src/telemetry');
const { trace } = require('@opentelemetry/api');

function createMemoryExporter() {
  const spans = [];
  return {
    export(exportedSpans, callback) {
      spans.push(...exportedSpans);
      callback({ code: 0 });
    },
    shutdown() {
      return Promise.resolve();
    },
    getFinishedSpans() {
      return spans;
    },
  };
}

async function main() {
  const exporter = createMemoryExporter();
  const sdk = initTelemetry({
    serviceName: 'telemetry-smoke',
    serviceVersion: '1.0.0',
    environment: 'test',
    spanProcessors: [new BatchSpanProcessor(exporter)],
  });

  const tracer = trace.getTracer('telemetry-smoke');
  const span = tracer.startSpan('smoke-span');
  span.setAttribute('smoke', true);
  span.end();

  await sdk.shutdown();

  const spans = exporter.getFinishedSpans();
  assert.strictEqual(spans.length, 1, 'expected exactly one exported span');
  const [exported] = spans;
  assert.strictEqual(exported.name, 'smoke-span');
  assert.strictEqual(exported.attributes.smoke, true);
  assert.strictEqual(
    exported.resource.attributes['service.name'],
    'telemetry-smoke',
  );
  assert.strictEqual(
    exported.resource.attributes['deployment.environment'],
    'test',
  );

  process.stdout.write(
    `telemetry smoke ok: span="${exported.name}" service="${exported.resource.attributes['service.name']}"\n`,
  );
}

main().catch((err) => {
  process.stderr.write(`telemetry smoke failed: ${err.message}\n`);
  process.exit(1);
});
