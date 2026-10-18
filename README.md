# ShopFacil — Arquitetura e Estratégia de Observabilidade

## 1. Introdução

O ShopFacil é um sistema de demonstração de e-commerce composto por cinco
serviços Node.js (gateway, catálogo, pedidos, estoque e pagamento) que juntos
executam um fluxo de checkout distribuído. Este documento descreve a arquitetura
do sistema e a estratégia de observabilidade adotada em três pilares — métricas,
logs e traces — incluindo a política de amostragem, o catálogo de alertas e os
dashboards.

O objetivo não é construir um sistema pronto para produção, mas um ambiente
genuíno o suficiente para responder a cinco perguntas operacionais:

1. O sistema está saudável?
2. Onde ocorreu a falha?
3. O que está lento?
4. Qual é a causa raiz?
5. Como evitar a recorrência?

O sistema roda inteiramente em uma única máquina com Docker Compose, sem
Kubernetes e sem serviços de nuvem. Essa restrição mantém o custo baixo e torna
o ambiente reprodutível.

## 2. Visão de arquitetura

O tráfego chega ao **API Gateway**, que autentica o usuário, emite um JWT e
roteia as chamadas para os serviços internos, propagando o contexto de trace
W3C (`traceparent`) em cada salto.

```
                         +-------------------+
                         |      Cliente      |
                         +---------+---------+
                                   |  HTTP + traceparent (W3C)
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
```

Os serviços são:

| Serviço   | Porta | Responsabilidade                                            |
|-----------|-------|-------------------------------------------------------------|
| gateway   | 3000  | Autenticação JWT, roteamento `/api/*`, propagação de contexto |
| catalog   | 3001  | Listagem e consulta de produtos (SQLite)                    |
| orders    | 3004  | Orquestração do checkout, compensação em caso de falha       |
| inventory | 3002  | Reserva e liberação de estoque (SQLite)                     |
| payment   | 3003  | Cobrança e adaptador para o gateway externo simulado (4090) |

O fluxo de checkout é síncrono e gera spans reais entre os serviços, em vez de
trechos simulados. Isso permite que o trace comprove a passagem por cada etapa
e que a compensação (liberar estoque quando o pagamento falha) apareça como
spans próprios.

## 3. Decisões de arquitetura

### 3.1 Fastify em vez de Express

O Fastify foi escolhido por oferecer logging estruturado nativo, hooks de ciclo
de vida e um ecossistema de instrumentação OpenTelemetry mais direto. O Express
é mais familiar, mas exigiria mais código de cola para obter o mesmo resultado.

### 3.2 Comportamento mínimo, porém real

Catálogo e estoque usam SQLite, de modo que o checkout produz transições de
estado genuínas (estoque decrementado, reserva criada e liberada). Pedidos
orquestra de forma síncrona via HTTP, gerando spans entre serviços. Esse é o
menor modelo que ainda exercita compensação.

### 3.3 Autenticação no gateway

`POST /auth/login` valida credenciais contra um pequeno conjunto semeado e
emite um JWT HS256. Um `preHandler` verifica o token nas rotas protegidas. Não
há serviço de autenticação dedicado: a topologia permanece com cinco serviços e
o evento de login ocorre dentro de um salto já rastreado.

### 3.4 SDK OTel em cada serviço, Collector como pipeline

Cada serviço usa o SDK OpenTelemetry e exporta OTLP para um Collector. O
Collector — e não cada serviço — controla a política de amostragem e de
exportação. Assim, mudanças de política não exigem redeploy dos serviços e todos
os sinais convergem para uma única configuração.

### 3.5 Tail sampling exige um Collector gateway

A política "100% dos erros e requisições acima de 1 s, 10% do restante" não pode
ser obtida com head sampling no SDK, porque o SDK decide antes de conhecer o
desfecho da requisição. O processador `tail_sampling` do Collector armazena
traces completos e decide após o término, com as políticas:

1. `status_code = ERROR` → manter 100%.
2. `latency > 1s` → manter 100%.
3. `probabilistic 10%` → todo o restante.

Consequência: todos os serviços precisam rotear spans pelo Collector, e o
tráfego é bufferizado em memória (ver Riscos).

### 3.6 Logs estruturados com correlação automática

Os serviços registram JSON via `pino`. O contexto OTel é injetado no logger, de
modo que `trace_id` e `span_id` aparecem automaticamente em cada registro, sem
tratamento manual por chamada. Um caminho de redação mascara `password`,
`authorization`/`token` e dados de cartão antes da serialização. Os logs são
enviados ao Loki.

## 4. Stack de observabilidade

| Componente        | Papel                                                                 |
|-------------------|-----------------------------------------------------------------------|
| OTel Collector    | Recebe OTLP, aplica tail sampling, exporta traces para o Tempo        |
| Prometheus        | Coleta `/metrics` dos serviços, node-exporter e blackbox; avalia regras |
| Grafana           | Datasources (Prometheus/Loki/Tempo) + dashboards provisionados         |
| Loki              | Armazenamento de logs, consultável por serviço e por trace id          |
| Tempo             | Armazenamento de traces                                                |
| Alertmanager      | Roteia alertas disparados para um receiver webhook local (demo)        |
| Blackbox Exporter | Sonda endpoints de serviço para disponibilidade                        |
| node-exporter     | Métricas de CPU, memória e disco do host                               |

Todos os componentes sobem com `docker compose up`. O acesso aos serviços e às
interfaces ocorre pelas portas: gateway 3000, catálogo 3001, estoque 3002,
pagamento 3003, pedidos 3004, Grafana 3005, Prometheus 9090, Alertmanager 9093,
Loki 3100, Tempo 3200, Collector 4317/4318 e webhook 5001.

## 5. Estratégia de métricas

Cada serviço expõe um endpoint `/metrics` compatível com Prometheus. O
`prom-client` adiciona métricas de processo (CPU, memória, file descriptors) e
um rótulo `service` em todas as séries, permitindo agregações por serviço.

### 5.1 Catálogo de métricas

| # | Métrica                                   | Tipo      | Origem             | Atende                          |
|---|-------------------------------------------|-----------|--------------------|---------------------------------|
| 1 | `http_server_request_duration_seconds`    | histogram | serviços           | latência p95, tempo de resposta |
| 2 | `http_server_requests_total{status}`      | counter   | serviços           | throughput, taxa 4xx/5xx        |
| 3 | `process_cpu_seconds_total` / `node_cpu`  | counter   | serviço + node     | uso de CPU                      |
| 4 | `process_resident_memory_bytes` / `node_memory` | gauge | serviço + node   | uso de memória                  |
| 5 | `node_filesystem_avail_bytes`             | gauge     | node-exporter      | uso de disco                    |
| 6 | `up` / `probe_success`                    | gauge     | Prometheus + blackbox | disponibilidade              |
| 7 | `shopfacil:availability:ratio`            | recording | Prometheus         | disponibilidade agregada        |
| 8 | `shopfacil:mttr_seconds`                  | recording | Prometheus (ALERTS)| MTTR                            |
| 9 | `db_active_connections`                   | gauge     | catálogo/estoque   | conexões ativas                 |
|10 | `payment_outcome_total{outcome}`          | counter   | pagamento          | taxa de aprovação               |
|11 | `checkout_duration_seconds`               | histogram | pedidos            | tempo do checkout               |
|12 | `external_gateway_failures_total`         | counter   | pagamento          | falhas do gateway externo       |

### 5.2 Disponibilidade e MTTR

Serviços crus não conseguem emitir "disponibilidade" ou "MTTR" de forma
significativa. A disponibilidade é derivada de `up` e `probe_success`
(blackbox). O MTTR não pode ser calculado com uma única coleta; ele é derivado
do ciclo de vida do alerta via regras de gravação sobre `ALERTS_FOR_STATE`
(tempo desde o disparo). Trata-se de uma aproximação adequada para a demo e
explicitada aqui.

## 6. Estratégia de logs

### 6.1 Formato

Os registros são JSON e contêm, no mínimo: `timestamp`, `level`, `service`,
`message`, `trace_id` e `span_id`. Eventos de negócio e de auditoria incluem o
campo `event` (`login`, `http.request`, `error`, `audit`, `critical`) e campos
de contexto como `http.method`, `http.route`, `http.status_code` e `user_id`.

### 6.2 Correlação

Graças à ponte entre o contexto OTel e o `pino`, o `trace_id`/`span_id` do span
ativo é injetado em cada registro. Isso permite que uma consulta no Loki por
`trace_id` retorne os logs de todos os serviços que participaram do mesmo trace.

### 6.3 Mascaramento

Valores sensíveis — `password`, `token`, `authorization` e campos de cartão
(`card`, `cardNumber`, `cvv`) — são censurados com `[Redacted]` antes de serem
serializados, de modo que segredos nunca apareçam em texto claro nos logs.

### 6.4 Envio

O Promtail descobre os containers via socket do Docker e envia os logs ao Loki.
O Loki indexa por labels (incluindo `service` e `trace_id` no conteúdo),
possibilitando consultas por serviço e por trace id.

## 7. Estratégia de traces

### 7.1 Modelo de spans do checkout

```
trace: 1 request
|
+- [gateway] POST /api/checkout            (server span)
   |
   +- [orders] POST /checkout              (server span, filho)
      |
      +- [inventory] POST /inventory/reserve   (client+server span)
      |
      +- [payment] POST /payments              (client+server span)
         |
         +- [payment] POST /charge            (client span -> simulado)
```

Cada etapa gera um span, e a propagação W3C garante que todos pertençam ao
mesmo trace. As chamadas HTTP de saída usam a instrumentação `undici`, que cria
spans de cliente e injeta o `traceparent`; as entradas usam a instrumentação
`http`, que extrai o contexto e cria o span de servidor.

### 7.2 Amostragem

A política de tail sampling é aplicada no Collector, não no SDK:

- Erros: 100% retidos.
- Requisições acima de 1 segundo: 100% retidas.
- Restante: aproximadamente 10%.

Isso garante que as investigações sempre encontrem os traces relevantes, ao
mesmo tempo em que mantém o custo de armazenamento baixo em regime normal.

## 8. Alertas

As regras ficam versionadas em `infra/alerts.yml` e trazem condição, severidade
e ação esperada.

| # | Alerta             | Condição                                   | Severidade | Ação esperada                              |
|---|--------------------|--------------------------------------------|------------|--------------------------------------------|
| 1 | HighCpuUsage       | CPU > 80% por 5m                           | warning    | Inspecionar carga e laços lentos           |
| 2 | HighMemoryUsage    | memória > 90% por 5m                       | warning    | Investigar vazamentos / reiniciar          |
| 3 | HighLatency        | p95 > 500 ms por 5m                        | warning    | Localizar o serviço lento via traces       |
| 4 | ServiceDown        | `up`/probe == 0 por 1m                     | critical   | Reiniciar / investigar                     |
| 5 | HighErrorRate      | taxa 5xx > 5% por 5m                       | critical   | Inspecionar erros e traces retidos         |
| 6 | HighDiskUsage      | disco > 85% por 10m                        | warning    | Limpar volumes                             |
| 7 | PaymentFailure     | falhas do gateway externo acima do limiar  | critical   | Verificar o gateway externo                |

O Alertmanager roteia todos os alertas para um receiver webhook local
(`infra/webhook/server.js`), que registra as notificações (modo demo). Um
receiver Slack pode ser adicionado sem alterar as regras. Quando a condição
cessa, o alerta transita para `resolved` automaticamente, o que habilita o
cálculo aproximado de MTTR.

## 9. Dashboards

### 9.1 Visão Geral

O dashboard "Visão Geral" apresenta disponibilidade, CPU, memória, latência
p95 por serviço, erros por minuto, requisições por segundo e os serviços mais
lentos. Ele responde às perguntas "o sistema está saudável?" e "o que está
lento?".

### 9.2 Checkout

O dashboard "Checkout" apresenta a taxa de aprovação de pagamentos, o tempo do
checkout (p50/p95), o volume de resultados de pagamento e as falhas do gateway
externo. Ele responde "onde ocorreu a falha?" e "qual é a causa raiz?" no
fluxo de compra.

Ambos são versionados como JSON em `infra/grafana/dashboards` e provisionados
automaticamente pelo Grafana na inicialização, sem importação manual.

## 10. Operação

### 10.1 Subir a stack

```
docker compose up -d --build
```

### 10.2 Gerar tráfego de checkout

```
TOKEN=$(curl -s -XPOST localhost:3000/auth/login \
  -H 'content-type: application/json' \
  -d '{"username":"demo","password":"demo"}' | jq -r .token)

curl -s -XPOST localhost:3000/api/checkout \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"orderId":"demo-1","items":[{"productId":1,"quantity":1}],"amount":99.9}'
```

### 10.3 Simular falha de pagamento

O arquivo `infra/compose/failure-mode.yml` aponta o pagamento para um gateway
externo inalcançável, produzindo erros 502 e incrementando
`external_gateway_failures_total`:

```
docker compose -f docker-compose.yml -f infra/compose/failure-mode.yml \
  up -d --no-deps payment
```

Após alguns checkouts, o alerta `PaymentFailure` dispara, o trace de erro é
retido em 100% pelo tail sampling e o log correlacionado aparece no Loki. Para
voltar ao normal:

```
docker compose up -d --no-deps payment
```

### 10.4 Exportar este documento para PDF

```
npm run docs:pdf
```

O script gera `docs/architecture.pdf` a partir de `docs/architecture.md`.

## 11. Riscos e trade-offs

- **Tail sampling bufferiza traces em memória** → manter o tráfego de demo
  modesto e limitar `decision_wait`/`num_traces` no Collector; documentar o
  custo de memória.
- **MTTR aproximado** (derivado de alertas, não de incidentes) → rotulado
  claramente no dashboard e neste documento.
- **Pagamento simulado pode mascarar a semântica real** → manter a fronteira do
  adaptador explícita para que um cliente real possa substituí-lo.
- **Contenção do SQLite sob carga** → aceitável para a demo; fora do escopo de
  escala.
- **Stack local completa consome recursos** → é possível subir um perfil enxuto
  sem Loki/Tempo em máquinas com pouca memória.

## 12. Limitações

- Sem persistência durável de pedidos e sem hardening de produção (HA,
  autoscaling, gestão de segredos, TLS, nuvem).
- Sem integração de pagamento real, sem base de usuários real e sem testes de
  carga.
- Autenticação centralizada permanece apenas no gateway.

## 13. Referências

- `design.md` — decisões de design que originaram este documento.
- `infra/prometheus.yml`, `infra/recording-rules.yml`, `infra/alerts.yml` —
  coleta, regras de gravação e alertas.
- `infra/otel-collector.yaml` — pipeline e tail sampling.
- `infra/grafana/dashboards/*.json` — dashboards versionados.
- `test/integration/e2e.test.js` — verificação ponta a ponta de trace e logs.
