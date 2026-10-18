# platform Specification
## Purpose

Provide a reproducible local deployment of the application and its observability
stack.

## Requirements
### Requirement: One-command stack

A Docker Compose definition SHALL bring up the five services and the
observability components: OTel Collector, Prometheus, Grafana, Loki, Tempo,
Alertmanager, and Blackbox Exporter.

#### Scenario: Stack starts

- **WHEN** an operator runs the compose stack
- **THEN** all listed components start and expose their endpoints

### Requirement: Collector pipeline

The collector SHALL receive OTLP telemetry, apply the tail-sampling policy, and
export traces to Tempo.

#### Scenario: Traces reach Tempo

- **WHEN** services emit traces
- **THEN** sampled traces are stored in Tempo and queryable from Grafana

### Requirement: Scrape and datasource configuration

Prometheus SHALL scrape the services and exporters, and Grafana SHALL be
provisioned with Prometheus, Loki, and Tempo datasources.

#### Scenario: Datasources available

- **WHEN** Grafana starts
- **THEN** the Prometheus, Loki, and Tempo datasources are preconfigured
