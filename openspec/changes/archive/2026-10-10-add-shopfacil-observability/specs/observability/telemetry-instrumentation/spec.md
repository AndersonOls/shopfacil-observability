# Spec Delta

## Purpose

Establish a consistent OpenTelemetry setup across all services so traces,
metrics, and logs share identity and correlate automatically.

## ADDED Requirements

### Requirement: OpenTelemetry SDK initialization

Each service SHALL initialize the OpenTelemetry SDK before handling requests,
export telemetry over OTLP to the collector, and set resource attributes
`service.name`, `service.version`, and `deployment.environment`.

#### Scenario: Service identified in telemetry

- **WHEN** a service starts and handles a request
- **THEN** its traces, metrics, and logs carry the configured `service.name`

### Requirement: Automatic log correlation

Each service SHALL inject the active `trace_id` and `span_id` into every log
record automatically, without per-call manual handling.

#### Scenario: Log carries active span

- **WHEN** the application logs while a request has an active span
- **THEN** the log record contains that request's `trace_id` and `span_id`

### Requirement: Cross-service context propagation

Services SHALL propagate W3C trace context on outgoing HTTP calls so a single
request forms one distributed trace.

#### Scenario: Trace spans downstream services

- **WHEN** one instrumented service calls another
- **THEN** the callee's spans share the caller's trace id
