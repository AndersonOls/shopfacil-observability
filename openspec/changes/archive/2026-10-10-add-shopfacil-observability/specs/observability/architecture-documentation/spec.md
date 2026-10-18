# Spec Delta

## Purpose

Record the system architecture and the observability strategy as a reviewable,
versioned deliverable.

## ADDED Requirements

### Requirement: Architecture and strategy document

The project SHALL include a document, sourced from `design.md`, describing the
architecture (services, gateway, observability stack) and the strategy per
signal (metrics, logs, traces), including the sampling policy and the alert and
dashboard catalogs.

#### Scenario: Document present

- **WHEN** a reader opens the architecture document
- **THEN** it covers architecture, metrics, logs, traces, sampling, alerts, and dashboards

### Requirement: Exportable deliverable

The document SHALL be exportable to a PDF of 8 to 12 pages.

#### Scenario: PDF exported

- **WHEN** the document is exported to PDF
- **THEN** the resulting PDF is between 8 and 12 pages
