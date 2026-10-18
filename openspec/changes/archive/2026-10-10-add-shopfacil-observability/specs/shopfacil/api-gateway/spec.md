# Spec Delta

## Purpose

Expose a single entry point for ShopFácil clients, authenticating users, routing
requests to the microservices, and propagating distributed trace context.

## ADDED Requirements

### Requirement: JWT login at the gateway

The gateway SHALL authenticate a user via `POST /auth/login` with
username/password and, on success, return a signed JWT with subject and expiry.
Authentication SHALL live in the gateway; the system SHALL NOT depend on a
separate authentication service.

#### Scenario: Successful login

- **WHEN** a client posts valid credentials to `/auth/login`
- **THEN** the gateway responds 200 with a signed JWT and its expiry

#### Scenario: Invalid credentials

- **WHEN** a client posts invalid credentials to `/auth/login`
- **THEN** the gateway responds 401 and issues no token

### Requirement: Authenticated request routing

The gateway SHALL route registered API paths to the corresponding microservice
and SHALL reject requests to protected paths without a valid JWT.

#### Scenario: Valid token routes to service

- **WHEN** a client calls a protected path with a valid JWT
- **THEN** the gateway forwards the request to the target microservice and returns its response

#### Scenario: Missing or invalid token

- **WHEN** a client calls a protected path without a valid JWT
- **THEN** the gateway responds 401 and does not call any microservice

### Requirement: W3C trace context propagation

The gateway SHALL read the incoming W3C `traceparent` header, continue the
trace, and forward a `traceparent` header on every downstream microservice call.

#### Scenario: Context propagated downstream

- **WHEN** a request arrives with a `traceparent` header
- **THEN** the gateway creates its span in the same trace and sends a matching `traceparent` to the downstream service

### Requirement: Health endpoint

The gateway SHALL expose `GET /health` returning 200 when the process is ready
to accept traffic.

#### Scenario: Health check

- **WHEN** `GET /health` is called on a running gateway
- **THEN** the gateway responds 200
