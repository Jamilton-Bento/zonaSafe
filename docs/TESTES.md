# Resultados dos testes

Executados em 11/10/2026 em ambiente Linux com PostgreSQL 16 local (banco `central_test`, descartável). **Todos os eventos do WhatsApp nos testes são SIMULADOS** (`tests/helpers.ts`: `simulatedUpsert`, `FakeTransport`); nenhuma conta real foi usada.

## Automatizados — back-end (Vitest + Supertest): 75 de 75 passaram

```
✓ tests/whatsapp.test.ts > Webhooks (eventos SIMULADOS) > rejeita eventos sem segredo ou com segredo errado
✓ tests/whatsapp.test.ts > Webhooks (eventos SIMULADOS) > rejeita payload malformado e ignora instância desconhecida
✓ tests/whatsapp.test.ts > Webhooks (eventos SIMULADOS) > processa mensagem de texto, cria conversa e não grava a apikey
✓ tests/whatsapp.test.ts > Webhooks (eventos SIMULADOS) > previne duplicidade: o mesmo evento enviado várias vezes gera uma única mensagem
✓ tests/whatsapp.test.ts > Webhooks (eventos SIMULADOS) > reentrega com formato de evento diferente (MESSAGES_UPSERT) continua idempotente no nível da mensagem
✓ tests/whatsapp.test.ts > Webhooks (eventos SIMULADOS) > mensagens de grupo usam o participante como remetente
✓ tests/whatsapp.test.ts > Webhooks (eventos SIMULADOS) > trata imagem com legenda, áudio e ignora status/reações/protocolo
✓ tests/whatsapp.test.ts > Webhooks (eventos SIMULADOS) > mensagem editada atualiza o texto sem duplicar
✓ tests/whatsapp.test.ts > Webhooks (eventos SIMULADOS) > connection.update atualiza o estado e registra a última conexão
✓ tests/whatsapp.test.ts > Webhooks (eventos SIMULADOS) > central de mensagens: busca, filtros, tarefa/chamado a partir da mensagem e marcação
✓ tests/whatsapp.test.ts > Webhooks (eventos SIMULADOS) > evento com falha pode ser reprocessado de forma controlada
✓ tests/whatsapp.test.ts > Integração WhatsApp: conexão, QR, desconexão e envio > não afirma conexão sem confirmação da API (API indisponível => desconhecido)
✓ tests/whatsapp.test.ts > Integração WhatsApp: conexão, QR, desconexão e envio > QR Code: só administrador, não é persistido no banco e some ao conectar
✓ tests/whatsapp.test.ts > Integração WhatsApp: conexão, QR, desconexão e envio > desconexão e reconexão
✓ tests/whatsapp.test.ts > Integração WhatsApp: conexão, QR, desconexão e envio > configura instância e webhook com segredo; mostra erro se a API cair
✓ tests/whatsapp.test.ts > Integração WhatsApp: conexão, QR, desconexão e envio > envio exige conexão confirmada, respeita pausa e aciona o disjuntor após falhas
✓ tests/whatsapp.test.ts > Integração WhatsApp: conexão, QR, desconexão e envio > o front nunca recebe a chave da Evolution API
✓ tests/auth.test.ts > Conexão com PostgreSQL > health check consulta o banco
✓ tests/auth.test.ts > Autenticação > rejeita rotas privadas sem sessão
✓ tests/auth.test.ts > Autenticação > faz login, acessa /me e faz logout
✓ tests/auth.test.ts > Autenticação > armazena senha com hash bcrypt
✓ tests/auth.test.ts > Autenticação > bloqueia a conta após 5 senhas incorretas
✓ tests/auth.test.ts > Autenticação > usuário inativo não entra
✓ tests/auth.test.ts > Autenticação > cookie adulterado é recusado
✓ tests/auth.test.ts > Controle de permissões > LEITOR lê mas não escreve
✓ tests/auth.test.ts > Controle de permissões > TECNICO não gerencia usuários, auditoria nem exclui registros
✓ tests/auth.test.ts > Controle de permissões > ADMIN cria usuário e não pode rebaixar a si mesmo
✓ tests/auth.test.ts > Controle de permissões > registra auditoria de login
✓ tests/tasks-tickets.test.ts > Tarefas > cria, valida e conclui uma tarefa registrando histórico
✓ tests/tasks-tickets.test.ts > Tarefas > visualizações: hoje, atrasadas, próximos, sem prazo, aguardando, concluídas
✓ tests/tasks-tickets.test.ts > Tarefas > "Minhas tarefas" considera o responsável
✓ tests/tasks-tickets.test.ts > Tarefas > rejeita prazo inválido e ordena por prioridade
✓ tests/tasks-tickets.test.ts > Tarefas > protege contra injeção SQL em filtros
✓ tests/tasks-tickets.test.ts > Chamados > cria com número único, comenta e atualiza com histórico cronológico
✓ tests/tasks-tickets.test.ts > Chamados > só conclui com solução aplicada e registra data de conclusão
✓ tests/tasks-tickets.test.ts > Chamados > filtra, pesquisa e ordena
✓ tests/tasks-tickets.test.ts > Chamados > cadastros: empresa, filial, contato e vínculo com chamados/tarefas
✓ tests/backup.test.ts > Backup e restauração do PostgreSQL > gera backup íntegro, restaura em outro banco e preserva os dados
✓ tests/backup.test.ts > Backup e restauração do PostgreSQL > restore recusa arquivo inexistente ou corrompido e exige confirmação
✓ tests/reports.test.ts > Relatórios programados > monta o relatório com dados reais
✓ tests/reports.test.ts > Relatórios programados > agendamento nasce inativo e só ativa depois de um teste bem-sucedido
✓ tests/reports.test.ts > Relatórios programados > prevenção de envio duplicado: o mesmo horário nunca dispara duas vezes
✓ tests/reports.test.ts > Relatórios programados > respeita frequência semanal/mensal e horário
✓ tests/reports.test.ts > Relatórios programados > falhas persistentes pausam o agendamento e avisam o administrador
✓ tests/reports.test.ts > Relatórios programados > WhatsApp pausado/desconectado: não envia, não conta como falha e registra no histórico
✓ tests/reports.test.ts > Relatórios programados > somente administradores configuram agendamentos
✓ tests/quotes.test.ts > Cálculos de orçamento > total = unitário × quantidade + frete
✓ tests/quotes.test.ts > Cálculos de orçamento > destaca o menor custo total válido, ignorando ofertas que não atendem
✓ tests/quotes.test.ts > Cálculos de orçamento > pesquisa incompleta (<3 fornecedores distintos válidos) não gera recomendação
✓ tests/quotes.test.ts > Orçamentos via API e PDF > calcula total no servidor, bloqueia aprovação com pesquisa incompleta e gera PDF
✓ tests/quotes.test.ts > Orçamentos via API e PDF > não aprova oferta que não atende às especificações e registra decisão
✓ tests/quotes.test.ts > Orçamentos via API e PDF > valida entradas (preço, link, data)
Test Files  6 passed (6)
     Tests  52 passed (52)
```

## Automatizados — front-end (Vitest): 3 de 3 passaram

Formatação de datas/moeda e conversão de reais para centavos (`apps/web/src/lib/format.test.ts`).

## Cobertura x requisitos da seção 17

| # | Requisito | Situação | Onde |
|---|---|---|---|
| 1 | Inicialização dos contêineres | **Não executado neste ambiente** — o sandbox de desenvolvimento não consegue baixar pacotes `apt`/imagens do Docker Hub (limite de pulls e sem DNS). `docker compose config` valida; o script `scripts/smoke-test.sh`/`.ps1` faz a verificação completa no seu Windows. | `scripts/smoke-test.*` |
| 2 | Conexão com PostgreSQL | Passou | `auth.test.ts` (health) |
| 3 | Autenticação | Passou | `auth.test.ts` |
| 4 | Tarefas (criar/concluir) | Passou | `tasks-tickets.test.ts` |
| 5 | Chamados (criar/atualizar) | Passou | `tasks-tickets.test.ts` |
| 6 | Recebimento de webhooks | Passou (eventos simulados) | `whatsapp.test.ts` |
| 7 | Validação dos eventos | Passou | `whatsapp.test.ts` |
| 8 | Prevenção de duplicidade | Passou (4 requisições simultâneas → 1 mensagem) | `whatsapp.test.ts` |
| 9 | Desconexão e reconexão | Passou (transporte simulado) | `whatsapp.test.ts` |
| 10 | Cálculos de orçamento | Passou | `quotes.test.ts` |
| 11 | Geração de PDF | Passou (cabeçalho/EOF/tamanho; conteúdo visual não conferido automaticamente) | `quotes.test.ts` |
| 12 | Agendamento de relatórios | Passou | `reports.test.ts` |
| 13 | Prevenção de envios duplicados | Passou (3 `tick` simultâneos → 1 envio) | `reports.test.ts` |
| 14 | Controle de permissões | Passou | `auth.test.ts` |
| 15 | Backup e restauração | Passou (backup → apagar dados → restaurar em outro banco → conferir) usando `pg_dump`/`psql` reais | `backup.test.ts` |

## Verificação manual (navegador real, Playwright/Chromium)
Login → registro rápido de tarefa → concluir → aba "Concluídas" → criar chamado → navegar por todas as 10 páginas do menu, sem erros de JavaScript. O dashboard refletiu corretamente os dados criados.

## O que NÃO foi testado
- Evolution API real (imagem `evoapicloud/evolution-api:v2.3.7`), QR Code real e envio/recebimento reais no WhatsApp.
- Build das imagens Docker e `docker compose up` completo (veja item 1).
- Nomes de rotas/corpos da Evolution API v2.3.7 foram escritos a partir de conhecimento da API v2 e conferência parcial no código-fonte oficial; a documentação oficial (`doc.evolution-api.com`) não estava acessível a partir do ambiente de desenvolvimento. **Confira na primeira execução** (veja README, seção "Primeira conexão").

## IA (23 testes novos em `tests/ai.test.ts`, provedor **SIMULADO**)
Desativada por padrão · permissões · mascaramento de dados pessoais · abre chamado com confiança alta · só sugere com confiança baixa · informativo não gera tarefa · vínculo a chamado aberto sem duplicar · recusa vínculo com chamado de outro solicitante · orçamento sem preços inventados · prioridade mínima para diretoria · injeção de prompt/JSON inválido/esquema inválido rejeitados · idempotência · grupos · limite diário · disjuntor por falhas e retomada · reanálise manual · rascunhos (aprovar envia ao contato certo, clique duplo envia uma vez, envio bloqueado preserva o rascunho, descartar, leitor sem permissão) · extração de oferta.

**Não testado:** chamadas reais à API do Gemini (sem chave/egress no ambiente de desenvolvimento) e a qualidade das classificações com mensagens reais. Recomenda-se começar com o limiar em 90% e revisar a aba "Análises recentes" por alguns dias.
