# dashboards Specification
## Purpose

Give operators at-a-glance visibility into overall system health and into the
checkout funnel.

## Requirements
### Requirement: Overview dashboard

The "Visão Geral" dashboard SHALL show availability, CPU, memory, latency,
errors per minute, requests per second, and the slowest services.

#### Scenario: Overview rendered

- **WHEN** an operator opens "Visão Geral"
- **THEN** the panels show the listed signals from live data

### Requirement: Checkout dashboard

The "Checkout" dashboard SHALL show payment approval rate, checkout duration,
and external gateway failures.

#### Scenario: Checkout rendered

- **WHEN** an operator opens "Checkout"
- **THEN** the panels show payment approval rate, checkout time, and gateway failures

### Requirement: Provisioned dashboards

Dashboards SHALL be versioned as code and provisioned automatically by Grafana.

#### Scenario: Provisioned on startup

- **WHEN** the Grafana container starts with provisioning
- **THEN** both dashboards are available without manual import
