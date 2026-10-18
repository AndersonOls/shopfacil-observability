# Spec Delta

## Purpose

Expose the metrics needed to assess health, latency, throughput, errors,
capacity, and reliability of the system.

## ADDED Requirements

### Requirement: Metrics exposition

Each service SHALL expose a Prometheus-compatible `/metrics` endpoint, and the
platform SHALL also collect host metrics and external blackbox probes.

#### Scenario: Scrape succeeds

- **WHEN** Prometheus scrapes a service's `/metrics`
- **THEN** the service returns metrics including request and latency series

### Requirement: Required metric set

The system SHALL provide at least these metrics: response time p95, latency per
service, throughput, CPU usage, memory usage, disk usage, request count, 4xx
error rate, 5xx error rate, availability, MTTR, and active database connections.

#### Scenario: Latency histogram present

- **WHEN** requests are served
- **THEN** a latency histogram is exported so p95 can be computed per service

#### Scenario: Error counters present

- **WHEN** requests complete with 4xx or 5xx status
- **THEN** counters for those status classes increment

#### Scenario: Connection gauge present

- **WHEN** a service holds database connections
- **THEN** an active-connections gauge reports the current count

### Requirement: Availability and MTTR derivation

The system SHALL derive availability from service and probe up status, and SHALL
compute MTTR from the alert lifecycle via Prometheus recording rules.

#### Scenario: Availability reflects downtime

- **WHEN** a service's `up` or blackbox probe is 0
- **THEN** the availability series reflects the outage

#### Scenario: MTTR from alerts

- **WHEN** an alert fires and later resolves
- **THEN** MTTR is computed from the interval between its start and resolution
