'use strict';

const resources = require('@opentelemetry/resources');
const { NodeSDK } = require('@opentelemetry/sdk-node');
const {
  OTLPTraceExporter,
} = require('@opentelemetry/exporter-trace-otlp-http');
const { BatchSpanProcessor } = require('@opentelemetry/sdk-trace-base');
const { UndiciInstrumentation } = require('@opentelemetry/instrumentation-undici');
const { HttpInstrumentation } = require('@opentelemetry/instrumentation-http');
const { propagation } = require('@opentelemetry/api');
const {
  W3CTraceContextPropagator,
  W3CBaggagePropagator,
  CompositePropagator,
} = require('@opentelemetry/core');

const SERVICE_NAME = 'service.name';
const SERVICE_VERSION = 'service.version';
const DEPLOYMENT_ENVIRONMENT = 'deployment.environment';

function configurePropagator() {
  const propagator = new CompositePropagator({
    propagators: [new W3CTraceContextPropagator(), new W3CBaggagePropagator()],
  });
  propagation.setGlobalPropagator(propagator);
  return propagator;
}

function resolveTraceEndpoint() {
  if (process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT) {
    return process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT;
  }
  if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
    return `${process.env.OTEL_EXPORTER_OTLP_ENDPOINT.replace(/\/$/, '')}/v1/traces`;
  }
  return 'http://localhost:4318/v1/traces';
}

function buildResource({ serviceName, serviceVersion, environment }) {
  const attributes = {
    [SERVICE_NAME]: serviceName,
    [SERVICE_VERSION]: serviceVersion,
    [DEPLOYMENT_ENVIRONMENT]: environment,
  };
  if (typeof resources.resourceFromAttributes === 'function') {
    return resources.resourceFromAttributes(attributes);
  }
  return new resources.Resource(attributes);
}

function initTelemetry(options = {}) {
  const serviceName =
    options.serviceName || process.env.OTEL_SERVICE_NAME || 'unknown-service';
  const serviceVersion =
    options.serviceVersion || process.env.SERVICE_VERSION || '1.0.0';
  const environment =
    options.environment ||
    process.env.DEPLOYMENT_ENVIRONMENT ||
    process.env.NODE_ENV ||
    'local';

  const resource = buildResource({ serviceName, serviceVersion, environment });
  const textMapPropagator = configurePropagator();

  const sdkOptions = {
    resource,
    textMapPropagator,
    instrumentations: [
      new HttpInstrumentation(),
      new UndiciInstrumentation(),
    ],
  };
  if (options.spanProcessors) {
    sdkOptions.spanProcessors = options.spanProcessors;
  } else if (options.spanExporter) {
    sdkOptions.spanProcessors = [new BatchSpanProcessor(options.spanExporter)];
  } else {
    sdkOptions.spanProcessors = [
      new BatchSpanProcessor(
        new OTLPTraceExporter({ url: resolveTraceEndpoint() }),
      ),
    ];
  }

  const sdk = new NodeSDK(sdkOptions);
  sdk.start();

  const shutdown = async () => {
    try {
      await sdk.shutdown();
    } catch (err) {
      // best-effort shutdown
    }
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);

  globalThis.__otelSdk = sdk;
  return sdk;
}

module.exports = { initTelemetry, resolveTraceEndpoint, buildResource };
