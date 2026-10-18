# Design

## Context

See `proposal.md` for motivation. This design covers a greenfield monorepo: no
code exists yet, only the OpenSpec scaffold. The system must run locally on a
single machine with Docker, favor a small learning/portfolio footprint, yet
produce telemetry that is genuine enough to answer five operational questions:
is the system healthy, where did it fail, what is slow, what is the root cause,
and how do we prevent recurrence.

Constraints that shape the approach:

- Node.js (LTS) with Fastify (chosen over Express; see Decisions D1).
- Everything runs via Docker Compose; no Kubernetes, no cloud services.
- One OpenSpec change, implemented in three phases.
- Payment talks to a *simulated* external gateway so latency/failures are
  controllable.

## Goals / Non-Goals

**Goals:**

- Five minimal but behaviorally-real services: gateway, catalog, inventory,
  orders, payment.
- A single distributed trace per checkout, correlated logs, and a metric set
  that answers the five operational questions.
- Tail-based sampling so all errors and slow requests are retained while the
  steady state stays cheap.
- Alerts and dashboards that are versioned as code and reviewable.

**Non-Goals:**

- Production hardening (HA, autoscaling, secrets management, TLS, cloud).
- Real payment integration, real user store, or durable order persistence.
- Multi-tenant or scale testing.
- Centralized auth service (auth stays in the gateway).

## Architecture

```
                         +-------------------+
                         |      Cliente      |
                         +---------+---------+
                                   |  HTTPS + traceparent (W3C)
                                   v
                 +-----------------------------------+
                 |            API Gateway            |
                 |  POST /auth/login (JWT)           |
                 |  roteia /api/* + propaga contexto |
                 +--+--------+--------+--------+-----+
                    |        |        |        |
            +-------v-+ +----v---+ +--v-----+ +v--------+
            | Catálogo| |Pedidos | |Pagamento| |Estoque  |
            | SQLite  | |orquest.| |  + sim  | | SQLite  |
            +---------+ +---+----+ +----+----+ +---------+
                          |  |          |
                          |  +--> Estoque (reserva/libera)
                          |             |
                          +-------->  Gateway externo simulado

   Telemetria (OTLP)                +----------------------------+
   de todos os serviços  ---------> |      OTel Collector        |
                                    |  tail_sampling (100%/10%)  |
                                    +----+----------+------------+
                                         |          |
                                    traces        metrics (scrape)
                                         v               v
                                      Tempo        Prometheus  <-- node-exporter
                                         |               |          blackbox
                                         |               v
                                         |          Alertmanager --> webhook (demo)
                                         v               |
                                      Grafana  <---------+
                                         ^
                                         |
                                       Loki  <-- logs (pino JSON, trace_id/span_id)
```

## Decisions

### D1. Fastify over Express

Fastify's built-in JSON schema validation, structured logging hooks, and
first-class OpenTelemetry plugin ecosystem (`@opentelemetry/instrumentation-
fastify`) reduce the glue code needed to get real telemetry. Express is more
familiar but requires more manual middleware for the same result.

### D2. Minimal-but-real service behavior

Catalog and inventory use SQLite (in-memory or file) so the checkout has genuine
state transitions (stock decremented, reservation created/released). Orders
orchestrates synchronously over HTTP so the trace has real cross-service spans
instead of mocked ones. This is the smallest model that still exercises
compensation (payment failure -> release reservation).

### D3. Auth in the gateway (no auth service)

`POST /auth/login` validates credentials against a small seeded user set and
issues an HS256 JWT. A preHandler verifies the token on protected routes. Trade-
off: no user lifecycle, but it keeps the topology to five services and keeps the
login event inside an already-traced hop.

### D4. OTel SDK in each service, Collector as the pipeline

Services use the OpenTelemetry SDK and export OTLP to a Collector. The Collector
(rather than each service) owns the sampling and export policy, so policy changes
do not require redeploying services and all signals converge on one config.

### D5. Tail sampling requires a Collector gateway

**This is the key architectural decision.** "100% of errors and requests over 1 s,
10% otherwise" cannot be achieved by SDK head-sampling: the SDK decides before
the request outcome is known. The Collector's `tail_sampling` processor buffers
complete traces and decides after they end, using policies:

1. `status_code` = ERROR -> keep 100%.
2. `latency` > 1s -> keep 100%.
3. `probabilistic` 10% -> everything else.

Consequence: all services must route spans through the Collector, and traffic is
buffered in memory (see Risks).

### D6. Structured logs with automatic correlation

Services log JSON via `pino`. The OTel context is bridged into the logger so
`trace_id`/`span_id` are injected on every record automatically (no per-call
middleware). A redaction path masks `password`, `authorization`/`token`,
and card fields before serialization. Logs are shipped to Loki.

**Log record schema**

| Field | Meaning |
|-------|---------|
| `timestamp` | ISO-8601 timestamp |
| `level` | pino level (info/warn/error/...) |
| `service` | `service.name` resource attribute |
| `message` | Human-readable message |
| `trace_id`, `span_id` | Active span correlation |
| `event` | Domain event: `login`, `http.request`, `error`, `audit`, `critical` |
| context fields | e.g. `http.method`, `http.route`, `http.status_code`, `user_id` |

### D7. Observability stack composition

| Component | Role |
|-----------|------|
| OTel Collector | OTLP receiver, tail sampling, export to Tempo; exposes own metrics |
| Prometheus | Scrapes services `/metrics`, node-exporter, blackbox-exporter; evaluates alert rules; recording rules for availability/MTTR |
| Grafana | Datasources (Prometheus/Loki/Tempo) + provisioned dashboards |
| Loki | Log storage, queried by service and trace id |
| Tempo | Trace storage |
| Alertmanager | Routes fired alerts to a local webhook receiver (demo) |
| Blackbox Exporter | Probes service endpoints for availability |
| node-exporter | Host CPU, memory, disk |

### D8. Metric catalog

| # | Metric | Type | Source | Serves |
|---|--------|------|--------|--------|
| 1 | `http_server_request_duration_seconds` | histogram | services | latency p95, tempo de resposta |
| 2 | `http_server_requests_total{status}` | counter | services | requisições, throughput, taxa 4xx/5xx |
| 3 | `process_cpu_seconds_total` / `node_cpu` | counter/gauge | service + node-exporter | uso de CPU |
| 4 | `process_resident_memory_bytes` / `node_memory` | gauge | service + node-exporter | uso de memória |
| 5 | `node_filesystem_avail_bytes` | gauge | node-exporter | uso de disco |
| 6 | `up` / `probe_success` | gauge | Prometheus + blackbox | disponibilidade |
| 7 | `shopfacil:availability:ratio` | recording rule | Prometheus | disponibilidade agregada |
| 8 | `shopfacil:mttr_seconds` | recording rule | Prometheus (ALERTS lifecycle) | MTTR |
| 9 | `db_active_connections` | gauge | catálogo/estoque | conexões ativas |
| 10 | `payment_outcome_total{outcome}` | counter | pagamento | taxa de aprovação |
| 11 | `checkout_duration_seconds` | histogram | pedidos | tempo do checkout |
| 12 | `external_gateway_failures_total` | counter | pagamento | falhas do gateway externo |

`throughput` = `rate(http_server_requests_total[1m])`, `p95` per service =
`histogram_quantile(0.95, ...)`. Availability and MTTR are derived, not scraped
(see D9).

### D9. Availability and MTTR derivation

Raw services cannot emit "availability" or "MTTR" meaningfully. Availability
comes from `up` and `probe_success` (Blackbox). MTTR cannot be computed from a
single scrape; it is derived from the alert lifecycle using Prometheus recording
rules over `ALERTS` (time from firing to resolved). This is an approximation
adequate for the demo and is stated explicitly in the architecture document.

### D10. Alert catalog

| # | Alert | Condition | Severity | Expected action |
|---|-------|-----------|----------|-----------------|
| 1 | High CPU | CPU > 80% for 5m | warning | Inspect load / slow loops |
| 2 | High Memory | mem > 90% for 5m | warning | Inspect leaks / restart |
| 3 | High Latency | p95 > 500 ms for 5m | warning | Find slow service via traces |
| 4 | Service Down | `up`/probe == 0 for 1m | critical | Restart / investigate |
| 5 | High 5xx | 5xx rate > 5% for 5m | critical | Inspect errors/traces |
| 6 | High Disk | disk > 85% for 10m | warning | Clean up volumes |
| 7 | Payment Failure | gateway failures exceed threshold | critical | Check external gateway |

Alertmanager routes all alerts to a local webhook receiver that logs them
(demo mode); a Slack receiver can be added without changing rules.

### D11. Dashboards

- **Visão Geral**: disponibilidade, CPU, memória, latência (p95), erros/minuto,
  requisições/segundo, serviços mais lentos.
- **Checkout**: taxa de aprovação de pagamentos, tempo do checkout, falhas do
  gateway externo.

Both are JSON provisioned by Grafana on startup, not imported by hand.

## Checkout span model

```
trace: 1 request
|
+- [gateway] POST /api/checkout            (server span)
   |
   +- [orders] POST /checkout              (server span, child)
      |
      +- [inventory] POST /inventory/reserve   (client+server span)
      |
      +- [payment] POST /payments              (client+server span)
         |
         +- [payment] ext.gateway.charge       (client span -> simulado)
```

## Risks / Trade-offs

- **Tail sampling buffers traces in memory** -> keep the demo traffic modest and
  set `decision_wait`/`num_traces` limits on the Collector; document the memory
  cost.
- **MTTR approximate** (derived from alerts, not incidents) -> label it clearly
  in the doc and dashboard.
- **Simulated payment may mask real gateway semantics** -> keep the adapter
  boundary explicit so a real client could replace it.
- **SQLite contention under load** -> fine for demo; noted as a non-goal for
  scale.
- **Full local stack is resource-hungry** -> provide a slim compose profile that
  omits Loki/Tempo for low-RAM machines (optional).

## Migration / Rollout Plan

Phased, matching the proposal:

1. **Phase 1** - services + instrumentation; verify a single trace spans the
   checkout and logs carry `trace_id`.
2. **Phase 2** - Collector + Prometheus + Grafana + Loki + Tempo + Alertmanager
   via Compose; verify tails, scrapes, and log queries.
3. **Phase 3** - alert rules, dashboards, and the architecture document.

Rollback: each phase is additive; removing a compose service or reverting the
change directory returns to the prior state.

## Open Questions

- Should the slim compose profile (no Loki/Tempo) be shipped, or is the full
  stack always expected? Deferrable; does not change specs.
- Which payment-failure threshold best exercises alert #7 during the demo?
  Tune during Phase 3.
