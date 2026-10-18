# tracing Specification
## Purpose

Provide end-to-end traces of the checkout so latency and failures can be
localized to a specific step.

## Requirements
### Requirement: Checkout span model

The system SHALL create a span for each checkout step: gateway, order
orchestration, inventory reservation, payment, and the external gateway call.

#### Scenario: Checkout produces spans

- **WHEN** a checkout request completes
- **THEN** a trace exists containing spans for each executed step

### Requirement: W3C traceparent propagation

Services SHALL propagate trace context between hops using the W3C `traceparent`
header.

#### Scenario: One trace across services

- **WHEN** a request crosses gateway, orders, inventory, and payment
- **THEN** all emitted spans belong to a single trace

### Requirement: Tail-based sampling policy

The collector SHALL keep 100% of traces that contain an error or whose duration
exceeds 1 second, and SHALL sample approximately 10% of all other traces.

#### Scenario: Error traces kept

- **WHEN** a trace contains an error span
- **THEN** the collector keeps the trace regardless of the sampling rate

#### Scenario: Slow traces kept

- **WHEN** a trace lasts longer than 1 second
- **THEN** the collector keeps the trace

#### Scenario: Healthy traces sampled

- **WHEN** a trace has no error and lasts at most 1 second
- **THEN** the collector keeps it about 10% of the time
