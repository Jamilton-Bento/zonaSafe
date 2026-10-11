# Documentação dos endpoints (REST)

Base: `/api`. Formato JSON. Autenticação por cookie `central_session` (HttpOnly, SameSite=Lax) obtido em `POST /api/auth/login`.
Erros: `{ "error": "mensagem", "issues": [{ "campo", "mensagem" }] }` (400 de validação, 401 sem login, 403 sem permissão, 404, 409 conflito, 429 limite).

Perfis: **ADMIN** (tudo), **TECNICO** (opera tarefas/chamados/mensagens/orçamentos; não administra usuários, auditoria, QR Code, agendamentos nem exclui registros), **LEITOR** (somente `GET`).

## Público
| Método | Rota | Descrição |
|---|---|---|
| GET | `/health` | Saúde do back-end e do banco |
| POST | `/webhooks/evolution` | Webhook da Evolution API. Exige cabeçalho `x-webhook-secret`. 202 aceito · 200 duplicado · 401 segredo inválido · 400 formato inválido. Não é exposto pelo nginx. |

## Autenticação e usuários
| Método | Rota | Perfil | Descrição |
|---|---|---|---|
| POST | `/auth/login` `{email,password}` | — | Login (limite 20/15 min; bloqueio de 15 min após 5 erros) |
| POST | `/auth/logout` | — | Encerra a sessão |
| GET | `/auth/me` | logado | Usuário atual |
| GET/POST | `/users` | ADMIN | Lista/cria usuários (senha ≥ 10 caracteres) |
| PATCH | `/users/:id` | ADMIN | Nome, perfil, ativo, nova senha |
| GET | `/team` | logado | Id e nome dos usuários ativos (para atribuir responsáveis) |

## Cadastros
`GET/POST /companies`, `PATCH/DELETE /companies/:id` · `GET/POST /branches?companyId=`, `PATCH/DELETE /branches/:id` ·
`GET/POST /contacts?q=&companyId=&branchId=`, `GET/PATCH/DELETE /contacts/:id` (o `GET` por id traz chamados e tarefas do contato) ·
`GET/POST /suppliers`, `PATCH/DELETE /suppliers/:id`. `DELETE` exige ADMIN.

## Tarefas — `/tasks`
`GET /tasks?view=minhas|hoje|proximos|atrasadas|sem_prazo|aguardando|concluidas|todas&q=&status=&priority=&companyId=&branchId=&requesterId=`
`POST /tasks` · `GET /tasks/:id` (com histórico) · `PATCH /tasks/:id` · `DELETE /tasks/:id` (ADMIN).
Status: NOVA, PENDENTE, EM_ANDAMENTO, AGUARDANDO_RETORNO, CONCLUIDA, CANCELADA. Prioridade: BAIXA, NORMAL, ALTA, CRITICA.
`dueDate` aceita `AAAA-MM-DD` (vale até 23:59 local) ou ISO completo. `sourceMessageId` vincula a mensagem de origem.

## Chamados — `/tickets`
`GET /tickets?q=&status=&open=1&priority=&category=&companyId=&branchId=&requesterId=&sort=openedAt|dueDate|priority|number&dir=asc|desc`
`POST /tickets` · `GET /tickets/:id` (comentários, mensagens, histórico) · `PATCH /tickets/:id` · `POST /tickets/:id/comments {body}` · `DELETE /tickets/:id` (ADMIN).
Concluir (`CONCLUIDO`) exige `solution`.

## Mensagens — `/messages`
`GET /messages?q=&contactId=&conversationId=&group=1|0&from=AAAA-MM-DD&to=AAAA-MM-DD&processing=&page=` ·
`GET /messages/conversations` · `GET /messages/:id` · `PATCH /messages/:id {processing|taskId|ticketId}` ·
`DELETE /messages/:id` (ADMIN) · `POST /messages/purge {days}` (ADMIN, aplica retenção).

## WhatsApp — `/whatsapp` (ADMIN e TECNICO; ações marcadas: ADMIN)
`GET /whatsapp/status` (QR só para ADMIN) · `POST /instance/ensure` (ADMIN) · `POST /qr` (ADMIN) · `POST /disconnect` (ADMIN) ·
`POST /pause {paused,reason}` (ADMIN) · `POST /send-test {to}` (ADMIN) · `GET /events?status=` (ADMIN) · `POST /events/:id/reprocess` (ADMIN).

## Orçamentos — `/quotes`
`GET /quotes?status=` · `POST /quotes` · `GET/PATCH /quotes/:id` · `POST /quotes/:id/offers` · `PATCH|DELETE /quotes/:id/offers/:offerId` ·
`POST /quotes/:id/approval {decision,offerId?,approver,notes?}` · `GET /quotes/:id/pdf`.
Valores em **centavos** (`unitPriceCents`, `shippingCents`); `totalCents = unitPriceCents × quantity + shippingCents` é calculado no servidor.
A resposta traz `analysis` (`complete`, `recommendedId`, `lowestValidId`, `message`).

## Relatórios — `/reports`
`GET /reports/preview?type=` · `GET /reports/schedules` · `GET /reports/schedules/:id/runs` ·
`POST/PATCH/DELETE /reports/schedules` e `POST /reports/schedules/:id/test` (ADMIN).

## Painel e utilidades
`GET /dashboard` · `GET /search?q=` · `GET/POST /notifications`, `POST /notifications/read-all` · `GET /audit` (ADMIN) · `GET/PUT /settings` (ADMIN).

## IA — `/ai` (leitura: todos; ações de operação: ADMIN/TECNICO; configuração: ADMIN)
`GET /ai/status` · `PUT /ai/config {enabled,autoCreateThreshold,draftReplies,includeGroups}` (ADMIN) · `POST /ai/resume` (ADMIN) ·
`GET /ai/analyses` · `POST /ai/messages/:id/analyze` (reanálise manual) · `POST /ai/analyses/:id/accept {as?}` (aceitar sugestão) ·
`GET /ai/drafts?status=PENDENTE|FALHA|ENVIADO|DESCARTADO` · `POST /ai/drafts/:id/approve {text?}` (envia ao WhatsApp) · `POST /ai/drafts/:id/discard` ·
`POST /ai/extract-offer {text}` (rascunho de oferta a partir de texto colado; não salva nada).
