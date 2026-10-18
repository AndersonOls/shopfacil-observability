# inventory Specification
## Purpose

Manage stock so checkouts can reserve units and roll back reservations when
payment fails or an order is aborted.

## Requirements
### Requirement: Reserve units

The inventory SHALL reserve the requested quantity for an item via
`POST /inventory/reserve` when sufficient stock exists, decrementing available
stock and returning a reservation identifier.

#### Scenario: Reservation succeeds

- **WHEN** a reservation is requested for a quantity within available stock
- **THEN** inventory decrements stock and returns 200 with a reservation id

### Requirement: Reject reservations without stock

The inventory SHALL reject a reservation and leave stock unchanged when the
requested quantity exceeds available stock.

#### Scenario: Insufficient stock

- **WHEN** a reservation is requested for a quantity greater than available stock
- **THEN** inventory responds 409 with an error and does not change stock

### Requirement: Release units

The inventory SHALL release a previously created reservation via
`POST /inventory/release`, returning the units to available stock, and SHALL be
idempotent for an already-released or unknown reservation.

#### Scenario: Compensation returns stock

- **WHEN** a reservation created earlier is released
- **THEN** the reserved units return to available stock

#### Scenario: Releasing twice is safe

- **WHEN** an already-released or unknown reservation is released again
- **THEN** inventory responds successfully without changing stock
