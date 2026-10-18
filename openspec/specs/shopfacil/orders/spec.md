# orders Specification
## Purpose

Orchestrate the checkout flow, coordinating inventory reservation and payment
and compensating when a step fails.

## Requirements
### Requirement: Checkout orchestration

The orders service SHALL expose `POST /checkout` that reserves inventory,
processes payment, and returns an order result indicating success or failure.

#### Scenario: Successful checkout

- **WHEN** a checkout request has sufficient stock and an approved payment
- **THEN** orders returns a successful order result

#### Scenario: Checkout without stock

- **WHEN** a checkout request cannot reserve stock
- **THEN** orders returns a failure result and does not call payment

### Requirement: Compensation on payment failure

The orders service SHALL release the inventory reservation when payment is
declined or fails.

#### Scenario: Payment declined

- **WHEN** payment for a reserved order is declined
- **THEN** orders releases the reservation and returns a failure result

### Requirement: Checkout timeline

The orders service SHALL return the ordered list of checkout steps executed so
the flow can be inspected.

#### Scenario: Steps reported

- **WHEN** a checkout completes, whether successfully or not
- **THEN** orders returns the executed steps in order
