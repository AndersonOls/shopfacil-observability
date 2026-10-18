'use strict';

const { initTelemetry } = require('@shopfacil/telemetry');

initTelemetry({ serviceName: process.env.OTEL_SERVICE_NAME || 'payment' });

const { buildApp } = require('./app');
const { buildExternalGateway } = require('./external-gateway');

const host = process.env.HOST || '0.0.0.0';
const port = Number(process.env.PORT || 3003);
const gatewayPort = Number(process.env.EXTERNAL_GATEWAY_PORT || 4090);

async function main() {
  const gateway = buildExternalGateway({
    latencyMs: process.env.EXTERNAL_GATEWAY_LATENCY_MS,
    failureRate: process.env.EXTERNAL_GATEWAY_FAILURE_RATE,
  });
  await gateway.listen({ port: gatewayPort, host });
  process.stdout.write(
    `external gateway (simulated) listening on ${host}:${gatewayPort}\n`,
  );

  const app = buildApp();
  await app.listen({ port, host });
  app.log.info({ port, host }, 'payment listening');
}

main().catch((err) => {
  process.stderr.write(`payment failed to start: ${err.message}\n`);
  process.exit(1);
});
