# logging Specification
## Purpose

Produce structured, correlated, privacy-safe logs that can be searched and
joined to traces.

## Requirements
### Requirement: Structured JSON logs

Every service SHALL emit logs as JSON records containing at least `timestamp`,
`level`, `service`, `message`, `trace_id`, and `span_id`.

#### Scenario: Log record shape

- **WHEN** a service emits a log
- **THEN** the record is JSON containing all required fields

### Requirement: Business and audit events

The system SHALL log login attempts, HTTP requests, errors and exceptions,
audit-relevant actions, and critical events.

#### Scenario: Login is logged

- **WHEN** a login attempt occurs
- **THEN** a log record captures the attempt and its outcome

#### Scenario: Exception is logged

- **WHEN** an unhandled error or exception occurs
- **THEN** a log record captures the error and its stack

### Requirement: Sensitive data masking

Logs SHALL mask sensitive values such as passwords, tokens, and payment card
data, and SHALL NOT contain them in plain text.

#### Scenario: Secret never logged

- **WHEN** a request carries a password, token, or card number
- **THEN** the emitted log shows the field masked and never the raw value

### Requirement: Log shipping

Services SHALL make logs available to the log aggregation backend so they can be
queried by service and by trace id.

#### Scenario: Query by trace id

- **WHEN** an operator queries logs for a trace id
- **THEN** matching records from all services are returned
