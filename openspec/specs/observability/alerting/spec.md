# alerting Specification
## Purpose

Detect and route actionable problems so operators know what is wrong, how severe
it is, and what to do about it.

## Requirements
### Requirement: Alert rule set

The system SHALL define alerts with a condition, a severity, and an expected
action for: CPU above 80%, memory above 90%, latency p95 above 500 ms, service
unavailable, 5xx error rate above 5%, disk above 85%, and payment failure.

#### Scenario: Latency threshold alert fires

- **WHEN** latency p95 exceeds 500 ms for the configured duration
- **THEN** the latency alert fires with its severity and expected action

#### Scenario: Availability alert fires

- **WHEN** a service is unavailable for the configured duration
- **THEN** the service-unavailable alert fires

#### Scenario: Payment failure alert fires

- **WHEN** payment failures exceed the configured condition
- **THEN** the payment alert fires

### Requirement: Alert routing to demo receiver

Alertmanager SHALL route fired alerts to a local webhook receiver that records
notifications; routing MAY be extended to Slack later.

#### Scenario: Notification recorded

- **WHEN** an alert fires
- **THEN** the webhook receiver records the notification

### Requirement: Alert lifecycle

Alerts SHALL resolve automatically when their condition no longer holds,
enabling MTTR computation.

#### Scenario: Alert resolves

- **WHEN** the alert condition clears
- **THEN** the alert transitions to resolved
