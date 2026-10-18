# Proposal

## Why

A ShopFácil (um API Gateway e quatro microsserviços) não possui observabilidade:
não há como responder, com evidência, se o sistema está saudável, onde ocorreu
uma falha, qual componente está lento, qual é a causa raiz e como evitar
recorrências. Este change cria os serviços instrumentados e a stack de
observabilidade que tornam essas perguntas respondíveis.

## What Changes

- Cria cinco serviços Node.js (LTS) com Express/Fastify: **API Gateway**,
  **Catálogo**, **Estoque**, **Pedidos** e **Pagamento**. Comportamento mínimo,
  porém real, para gerar telemetria verdadeira.
- **Login JWT no Gateway** (sem serviço de autenticação separado); o Gateway
  roteia requisições e propaga o contexto W3C.
- Instrumentação **OpenTelemetry** em todos os serviços (traces, métricas, logs).
- **Logs** estruturados em JSON (`pino`) com `trace_id`/`span_id` injetados
  automaticamente e mascaramento de dados sensíveis.
- **Stack de observabilidade** em Docker: OTel Collector com `tail_sampling`
  (100% para erros e requisições acima de 1 s; 10% para o restante), Prometheus,
  Grafana, Loki, Grafana Tempo, Alertmanager e Blackbox Exporter.
- **Catálogo de 12+ métricas** expostas em `/metrics` (p95, latência, throughput,
  CPU, memória, disco, requisições, erros 4xx/5xx, disponibilidade, MTTR,
  conexões ativas no banco).
- **7 regras de alerta** com condição, severidade e ação esperada; roteamento do
  Alertmanager para um webhook local em modo demo.
- **Dois dashboards** Grafana: "Visão Geral" e "Checkout".
- **Documento de arquitetura e estratégia de observabilidade** (fonte:
  `design.md`, exportado para PDF de 8 a 12 páginas).

O change é organizado em três fases implementáveis de forma incremental:
(1) serviços instrumentados; (2) stack de observabilidade; (3) dashboards,
alertas e documentação.

## Capabilities

### New Capabilities

- `shopfacil/api-gateway`: roteamento de requisições para os microsserviços,
  login JWT e propagação do contexto de trace W3C.
- `shopfacil/catalog`: listagem e busca de produtos.
- `shopfacil/inventory`: reserva e liberação de unidades, com falha explícita
  quando não há saldo.
- `shopfacil/orders`: orquestração do checkout, orquestrando Estoque e Pagamento.
- `shopfacil/payment`: processamento de pagamento contra um gateway externo
  simulado, com latência e falhas configuráveis.
- `observability/telemetry-instrumentation`: configuração do SDK OpenTelemetry,
  atributos de recurso e correlação automática de `trace_id`/`span_id` nos logs.
- `observability/metrics`: catálogo e exposição das métricas da aplicação e da
  infraestrutura.
- `observability/logging`: esquema de log JSON estruturado e mascaramento de
  dados sensíveis.
- `observability/tracing`: modelo de spans por etapa do checkout e política de
  amostragem por tail sampling.
- `observability/alerting`: regras de alerta e roteamento/notificação do
  Alertmanager.
- `observability/dashboards`: dashboards Grafana "Visão Geral" e "Checkout".
- `observability/platform`: implantação da stack de observabilidade
  (Collector, Prometheus, Grafana, Loki, Tempo, Alertmanager, Blackbox).
- `observability/architecture-documentation`: documento de arquitetura e
  estratégia de observabilidade e sua exportação.

### Modified Capabilities

- Nenhuma. O projeto não possui specs existentes (greenfield).

## Impact

- **Novo código**: monorepo Node.js com `gateway/`, `services/catalog/`,
  `services/inventory/`, `services/orders/`, `services/payment/` e um pacote
  compartilhado de instrumentação.
- **Novas dependências**: `@opentelemetry/*`, `pino`, `fastify` (ou `express`),
  `jsonwebtoken`, `better-sqlite3` (Catálogo/Estoque), `undici`/`axios`.
- **Nova infraestrutura (Docker Compose)**: serviços + Collector + Prometheus +
  Grafana + Loki + Tempo + Alertmanager + Blackbox Exporter.
- **Configuração versionada**: `otel-collector.yaml`, `prometheus.yml`,
  `loki-config.yaml`, `tempo.yaml`, `alertmanager.yml`, `alerts.yml`,
  provisionamento de dashboards/datasources do Grafana.
- **Deliverável externo**: PDF de arquitetura derivado de `design.md`.
- **Sem quebra**: projeto novo, não afeta sistemas existentes.
