# payment Specification
## Purpose

Process payments against a simulated external gateway whose latency and failures
are configurable, so the checkout can be exercised under realistic conditions.

## Requirements
### Requirement: Process payment

The payment service SHALL expose `POST /payments` that charges an order and
returns an outcome of approved or declined together with an external gateway
reference.

#### Scenario: Approved payment

- **WHEN** a payment is requested for a valid order
- **THEN** payment responds 200 with status approved and a gateway reference

#### Scenario: Declined payment

- **WHEN** the external gateway declines the charge
- **THEN** payment responds with status declined

### Requirement: Configurable external gateway

The payment service SHALL read its external gateway base URL, latency, and
failure rate from configuration so behavior can vary per environment.

#### Scenario: Injected latency

- **WHEN** configured latency is greater than zero
- **THEN** the simulated gateway delays its response by that latency

#### Scenario: Injected failures

- **WHEN** configured failure rate is greater than zero
- **THEN** the configured share of charge attempts fail

### Requirement: External gateway failure handling

The payment service SHALL report a failure and SHALL NOT approve the order when
the external gateway times out or is unavailable.

#### Scenario: Gateway unavailable

- **WHEN** the external gateway times out or returns an error
- **THEN** payment reports a failure and the order is not approved
