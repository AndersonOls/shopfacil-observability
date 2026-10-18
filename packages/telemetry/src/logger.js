'use strict';

const pino = require('pino');
const { trace, context } = require('@opentelemetry/api');

const REDACT_PATHS = [
  'password',
  '*.password',
  'token',
  '*.token',
  'access_token',
  '*.access_token',
  'authorization',
  '*.authorization',
  'card',
  '*.card',
  'cardNumber',
  '*.cardNumber',
  'card_number',
  '*.card_number',
  'creditCard',
  '*.creditCard',
  'credit_card',
  '*.credit_card',
  'cvv',
  '*.cvv',
];

function activeSpanFields() {
  const span = trace.getSpan(context.active());
  if (!span) {
    return {};
  }
  const spanContext = span.spanContext();
  if (!spanContext || !spanContext.traceId) {
    return {};
  }
  return { trace_id: spanContext.traceId, span_id: spanContext.spanId };
}

function createLogger(options = {}) {
  const pinoOptions = {
    level: options.level || process.env.LOG_LEVEL || 'info',
    base: {
      service:
        options.service || process.env.OTEL_SERVICE_NAME || 'unknown-service',
    },
    timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
    messageKey: 'message',
    redact: {
      paths: REDACT_PATHS,
      censor: '[Redacted]',
    },
    mixin: activeSpanFields,
  };

  if (options.stream) {
    return pino(pinoOptions, options.stream);
  }
  return pino(pinoOptions);
}

module.exports = { createLogger, REDACT_PATHS, activeSpanFields };
