# Tasks

## 1. Scaffolding e instrumentação compartilhada

- [x] 1.1 Criar o monorepo (`gateway/`, `services/catalog|inventory|orders|payment/`, `packages/telemetry/`, `infra/`, `docs/`) e verificar a árvore de diretórios esperada
- [x] 1.2 Configurar workspaces e dependências (`@opentelemetry/*`, `fastify`, `pino`, `jsonwebtoken`, `better-sqlite3`) e verificar que a instalação conclui sem erros
- [x] 1.3 Implementar em `packages/telemetry` a inicialização do SDK OTel com atributos `service.name`/`service.version`/`deployment.environment` e exportação OTLP e verificar com um script de fumaça que o span sai
- [x] 1.4 Implementar a correlação automática de `trace_id`/`span_id` no `pino` e o mascaramento de `password`/`token`/cartão, com teste unitário que confirma o registro JSON e o mascaramento

## 2. Serviço de Catálogo

- [x] 2.1 Implementar `GET /products`, `GET /products?q=` e `GET /products/:id` sobre SQLite semeado, com testes cobrindo lista, busca, busca vazia e 404
- [x] 2.2 Expor `GET /health` e `GET /metrics` e verificar que ambos respondem 200

## 3. Serviço de Estoque

- [x] 3.1 Implementar `POST /inventory/reserve` com decremento de estoque e teste de reserva bem-sucedida que retorna id
- [x] 3.2 Implementar a rejeição por saldo insuficiente (409, sem alterar estoque) com teste
- [x] 3.3 Implementar `POST /inventory/release`, idempotente, com testes de devolução de unidades e de liberação repetida

## 4. Serviço de Pagamento

- [x] 4.1 Implementar `POST /payments` e o adaptador do gateway externo simulado com latência/falha configuráveis, com testes de aprovado, recusado e timeout
- [x] 4.2 Garantir que timeout/indisponibilidade do gateway não aprove o pedido, com teste

## 5. Serviço de Pedidos

- [x] 5.1 Implementar `POST /checkout` orquestrando Estoque e Pagamento com testes de sucesso e de falha por falta de estoque (sem chamar pagamento)
- [x] 5.2 Implementar a compensação (release do estoque) quando o pagamento falha, com teste
- [x] 5.3 Retornar a linha do tempo de etapas do checkout e verificar em teste que as etapas aparecem na ordem

## 6. API Gateway

- [x] 6.1 Implementar `POST /auth/login` com JWT (HS256) e testes de login válido (200 + token) e inválido (401)
- [x] 6.2 Implementar o roteamento autenticado para os microsserviços com testes de rota válida e de 401 sem/with token inválido
- [x] 6.3 Garantir a propagação do W3C `traceparent` para o downstream com teste de cabeçalho encaminhado
- [x] 6.4 Expor `GET /health` e verificar 200

## 7. Verificação de rastreamento ponta a ponta

- [x] 7.1 Executar um checkout pela stack e verificar que um único trace contém spans de gateway, pedidos, estoque, pagamento e gateway externo
- [x] 7.2 Verificar que logs dos cinco serviços do mesmo trace carregam `trace_id`/`span_id` idênticos

## 8. Stack de observabilidade (Docker Compose)

- [x] 8.1 Criar `infra/otel-collector.yaml` com receiver OTLP e `tail_sampling` (erros 100%, >1s 100%, restante 10%) e verificar nos logs do Collector a retenção de um trace de erro e de um trace saudável
- [x] 8.2 Adicionar Prometheus + node-exporter + blackbox-exporter com `infra/prometheus.yml` e verificar os alvos `UP` na UI
- [x] 8.3 Adicionar Loki com `infra/loki-config.yaml` e verificar uma consulta por `service`
- [x] 8.4 Adicionar Tempo com `infra/tempo.yaml` e verificar traces armazenados e consultáveis
- [x] 8.5 Adicionar Grafana com datasources provisionados (Prometheus/Loki/Tempo) e verificar os três datasources na UI
- [x] 8.6 Adicionar Alertmanager + receiver webhook local e verificar que uma notificação é registrada
- [x] 8.7 Escrever `docker-compose.yml` subindo os serviços e todos os componentes, verificado por um único comando que sobe a stack

## 9. Métricas e regras de gravação

- [x] 9.1 Instrumentar os 12+ métricas do catálogo (histograma de latência, contadores por status, gauges de conexões, resultado de pagamento, tempo de checkout, falhas do gateway) e verificar a presença das séries em `/metrics`
- [x] 9.2 Adicionar recording rules de disponibilidade (`up`/`probe_success`) e de MTTR a partir do ciclo de vida de `ALERTS` e verificar os valores calculados no Prometheus

## 10. Alertas

- [x] 10.1 Escrever as 7 regras (`infra/alerts.yml`) com condição, severidade e ação esperada e verificar que cada regra carrega no Prometheus
- [x] 10.2 Configurar o roteamento do Alertmanager para o webhook demo e verificar o disparo e a resolução de ao menos uma regra

## 11. Dashboards

- [x] 11.1 Criar o dashboard "Visão Geral" (disponibilidade, CPU, memória, latência, erros/min, req/s, serviços mais lentos) e verificar os painéis com dados ao vivo
- [x] 11.2 Criar o dashboard "Checkout" (taxa de aprovação, tempo do checkout, falhas do gateway externo) e verificar os painéis com dados ao vivo
- [x] 11.3 Versionar os dois dashboards como JSON no provisionamento do Grafana e verificar que aparecem após reiniciar o container

## 12. Documentação e exportação

- [x] 12.1 Escrever o documento de arquitetura e estratégia a partir de `design.md` (arquitetura, métricas, logs, traces, amostragem, alertas, dashboards) e verificar a cobertura de todas as seções
- [x] 12.2 Exportar o documento para PDF e verificar que o resultado tem entre 8 e 12 páginas

## 13. Verificação de integração final

- [x] 13.1 Rodar o cenário feliz e o cenário de falha de pagamento e verificar: alerta disparado, trace do erro retido em 100%, log correlacionado e painel do Checkout refletindo a falha

## Workflow follow-up

- Arquivar o change após a revisão do projeto.
- Verificar o resultado arquivado.
