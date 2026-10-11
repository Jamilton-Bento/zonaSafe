# Central de TI — suporte técnico com WhatsApp

Sistema web local (Docker Compose, **custo R$ 0,00**) para registrar solicitações de suporte recebidas pelo WhatsApp e controlar chamados, tarefas, prazos, compras e orçamentos.

* **Front-end:** React + Vite + TypeScript + Tailwind + React Router + TanStack Query + React Hook Form + Zod
* **Back-end:** Node.js + TypeScript + Express + Prisma + PostgreSQL
* **WhatsApp:** [Evolution API](https://github.com/EvolutionAPI/evolution-api) **v2.3.7** (última estável gratuita; a série 2.4 exige ativação de licença) + Redis
* O sistema **continua funcionando com o WhatsApp desconectado**: o back-end não depende da Evolution API para subir.

> ⚠️ **Aviso sobre a Evolution API:** ela usa o protocolo do WhatsApp Web (método **não oficial**). Não há garantia de funcionamento permanente nem de ausência de bloqueio. Use **um número secundário autorizado** nos testes, nunca envie mensagens em massa e não tente contornar limites do WhatsApp.

## 1. Requisitos (Windows)

1. Windows 10/11 com **Docker Desktop** (modo WSL 2) instalado e **em execução**. Verifique no PowerShell:
   ```powershell
   docker --version
   docker compose version
   ```
2. Portas livres em `127.0.0.1`: **8081** (sistema) e **8080** (Evolution API, só diagnóstico). Para checar: `netstat -ano | findstr ":8081 :8080"` (sem resultado = livre). Altere `WEB_PORT`/`EVOLUTION_PORT` no `.env` se precisar.
3. ~3 GB livres em disco.

PostgreSQL (5432), Redis (6379) e o back-end (3001) **não são publicados** no computador: só existem na rede interna `central-net`.

## 2. Instalação

```powershell
cd C:\caminho\para\zonaSafe
copy .env.example .env
notepad .env        # troque TODOS os valores "TROQUE..." por segredos fortes
docker compose up -d --build
```

Gere segredos fortes (um para cada variável) no PowerShell:
```powershell
-join ((48..57)+(65..90)+(97..122) | Get-Random -Count 40 | % {[char]$_})
```
Acesse **http://localhost:8081** e entre com `ADMIN_EMAIL`/`ADMIN_PASSWORD` do `.env` (o administrador é criado apenas na primeira vez; depois você pode trocar a senha em *Configurações*).

Verifique se tudo subiu corretamente (serviços saudáveis, banco migrado, portas isoladas, Evolution API alcançável):
```powershell
.\scripts\smoke-test.ps1
```

## 3. Operação diária

| Ação | Comando |
|---|---|
| Iniciar | `docker compose up -d` |
| Encerrar (mantém os dados) | `docker compose down` |
| Estado e saúde dos contêineres | `docker compose ps` |
| Logs de todos os serviços (ao vivo) | `docker compose logs -f --tail=100` |
| Logs de um serviço | `docker compose logs -f api` (`web`, `evolution-api`, `postgres`, `redis`) |
| Reconstruir só o back-end | `docker compose up -d --build api` |
| Reconstruir só o front-end | `docker compose up -d --build web` |
| Reiniciar um serviço | `docker compose restart evolution-api` |

Os contêineres usam `restart: unless-stopped`: voltam sozinhos após reiniciar o computador (com o Docker Desktop iniciando com o Windows).

### ⚠️ Parar contêineres × remover volumes

* `docker compose down` **remove os contêineres e a rede, mas mantém os volumes** (`pgdata`, `redisdata`, `evolution_instances`). Seus chamados, tarefas, mensagens e a sessão do WhatsApp permanecem.
* `docker compose down -v` **APAGA os volumes = apaga todos os dados e a sessão do WhatsApp, sem volta.** Nunca use em operação normal. Faça backup antes (seção 6).

## 4. Primeira conexão com o WhatsApp (QR Code)

1. Cadastre em *Contatos* os telefones de quem envia mensagens (com DDI, ex.: `5511999999999`), para reconhecer os remetentes.
2. Abra **Integração WhatsApp** (como administrador).
3. Clique em **1. Preparar instância e webhook** (cria a instância `central-ti` e configura o webhook autenticado por segredo).
4. Clique em **2. Gerar QR Code** e, no celular **secundário**: WhatsApp → *Aparelhos conectados* → *Conectar um aparelho*.
5. A página só mostra **Conectado** quando a Evolution API confirma. O QR Code expira em ~45 s, fica apenas na memória do back-end e só é entregue a administradores.
6. Envie uma mensagem de outro número para o número conectado: ela deve aparecer na **Central de mensagens**.

**Conferência na primeira execução** (as rotas da Evolution foram implementadas segundo a API v2, mas a documentação oficial não estava acessível durante o desenvolvimento): se algum passo falhar, a página mostra o erro devolvido pela API; consulte `docker compose logs api evolution-api` e a documentação em <https://doc.evolution-api.com>. Os endpoints usados estão concentrados em `apps/api/src/modules/whatsapp/client.ts`.

**Desconectar com segurança:** *Desconectar sessão* na página (faz logout na Evolution API) e depois remova o aparelho em WhatsApp → *Aparelhos conectados*. Para apagar de vez as credenciais da sessão: desconecte e, só então, `docker compose down` + remoção do volume `evolution_instances` (`docker volume rm central-ti_evolution_instances`) — **confirme antes que não precisa dela**.

### Proteções contra bloqueio / envio excessivo
* Envio automático pode ser **pausado** na página; pausa automática após 3 falhas seguidas (notificação ao administrador).
* Intervalo mínimo de 5 s entre envios e teto de 50 envios/dia (configuráveis no `.env`).
* Reconexão **somente manual**, com intervalo mínimo de 30 s e no máximo 5 tentativas/hora. Não há laço de reconexão automática.
* Nenhuma mensagem é enviada sem destino configurado e testado por um administrador. Não há envio em massa.

## 4.1 Assistente de IA (Gemini, plano gratuito)

A IA lê cada mensagem recebida e decide: **chamado**, **tarefa**, **orçamento**, **informativo** ou **conversa**.

| O que a IA faz sozinha | O que exige você |
|---|---|
| Abre chamado/tarefa quando a confiança ≥ limiar (padrão 80%, ajustável) | Abaixo do limiar: só **sugere**; você clica "Virar chamado/tarefa/orçamento" |
| Vincula mensagem de continuação ao chamado aberto do mesmo solicitante (sem duplicar) | **Toda resposta ao usuário**: a IA redige um rascunho, **você aprova (e pode editar)** antes de enviar |
| Monta a **solicitação** de orçamento (produto, quantidade, especificações) | **Ofertas e preços**: a IA nunca inventa; você cadastra. Opcional: cole a proposta do fornecedor e a IA preenche o formulário para você conferir |
| Solicitações da diretoria nunca ficam abaixo de prioridade Alta (regra fixa, não da IA) | |

**Como ativar:**
1. Crie uma chave em <https://aistudio.google.com/apikey> **sem habilitar faturamento** e coloque em `GEMINI_API_KEY` no `.env`; rode `docker compose up -d` para recarregar o back-end.
2. Em **Assistente IA**, marque *Ativar a IA*. Ela nasce **desativada**.
3. Se o plano gratuito do Google mudar o nome dos modelos, ajuste `GEMINI_MODEL`.

**Proteções:** limite diário (`AI_DAILY_LIMIT`, padrão 150) e intervalo entre chamadas para respeitar a cota gratuita; pausa automática após 5 falhas seguidas (com notificação); e-mails, CPF/CNPJ, telefones e números longos são mascarados antes do envio; o texto das mensagens é tratado como **dado não confiável** (defesa contra injeção de prompt) e a resposta da IA é validada por esquema, sem poder executar nenhuma ação além das listadas; grupos só são analisados se você habilitar e nunca recebem rascunho de resposta.

> ⚠️ **Privacidade:** isto muda a regra original "tudo local". Com a IA ativa, o texto das mensagens (já mascarado) **sai do seu computador para o Google**; no plano gratuito, o Google pode usá-lo para melhorar seus produtos. Avise os usuários e deixe a IA desativada se houver conteúdo sigiloso. Se preferir 100% local, o provedor está isolado em `apps/api/src/modules/ai/provider.ts` e pode ser trocado por um modelo local (ex.: Ollama).
> A IA pode errar. Por isso as respostas passam por você e tudo que ela cria fica marcado no histórico como "IA".

## 5. Funcionalidades

Dashboard ("O que preciso resolver agora?") · Central de mensagens (busca, filtros, criar tarefa/chamado, vincular, marcar analisada) · Chamados (help desk completo, comentários, histórico) · Tarefas (8 visualizações, edição rápida de status/prioridade/prazo, destaque de atrasos) · Orçamentos (comparação de fornecedores, cálculo automático, PDF para a diretoria) · Contatos · Empresas, filiais e fornecedores · Relatórios programados · Integração WhatsApp · Configurações (usuários, retenção, auditoria) · Pesquisa global · Notificações.

**Orçamentos:** o sistema **não coleta preços** (sem scraping nem APIs pagas). Os botões abrem a busca do Mercado Livre, Magazine Luiza e Google Shopping no navegador; você cadastra cada oferta manualmente. A pesquisa só é "completa" com **3 ofertas válidas de fornecedores distintos**; ofertas marcadas como "não atende às especificações" nunca são recomendadas. O PDF é gerado localmente.

**Relatórios programados:** todo agendamento nasce **inativo e sem teste**. O administrador envia um *teste manual* ao destino e só então pode ativar. Cada horário executa no máximo uma vez (chave única por horário); após 3 falhas seguidas o agendamento é pausado e o administrador é notificado. Se o computador estiver desligado no horário, o relatório daquele horário **não** é enviado depois (sem recuperação retroativa, para evitar envios inesperados).

## 6. Backup e restauração

```powershell
.\scripts\backup.ps1                                    # gera backups\central-*.sql e backups\evolution-*.sql (mantém os 14 mais recentes)
.\scripts\restore.ps1 -File backups\central-AAAAMMDD-HHMMSS.sql    # DESTRUTIVO: pede confirmação digitando RESTAURAR
```
(Linux/macOS/WSL: `./scripts/backup.sh` e `./scripts/restore.sh arquivo.sql.gz`.)

**Como testar a recuperação sem risco** (recomendado fazer uma vez):
1. `.\scripts\backup.ps1`
2. Restaure em um banco de teste: `.\scripts\restore.ps1 -File backups\central-XXXX.sql -Database central_teste`
3. Confira: `docker compose exec postgres psql -U postgres -d central_teste -c "SELECT count(*) FROM \"Task\";"`
4. Remova o banco de teste: `docker compose exec postgres dropdb -U postgres central_teste`

O backup copia os dados do PostgreSQL. Guarde os arquivos de `backups\` **fora** do computador (disco externo/nuvem pessoal). Eles contêm dados do negócio e não devem ser versionados (já estão no `.gitignore`).

## 7. Desenvolvimento e testes

```bash
# banco local para testes (exemplo): PostgreSQL 16 com usuário/banco "central"/"central_test"
cd apps/api && npm ci && DATABASE_URL=postgresql://central:central_test@localhost:5432/central_test?schema=public npx prisma migrate deploy
npm test                      # 75 testes de integração (back-end)
cd ../web && npm ci && npm test && npm run build
```
Resultados e lacunas: [docs/TESTES.md](docs/TESTES.md). Endpoints: [docs/API.md](docs/API.md).

## 8. Segurança

* Segredos só em `.env` (fora do Git). A chave da Evolution API **nunca** chega ao navegador; o front só conversa com o back-end.
* Senhas com bcrypt (custo 12); sessão em cookie HttpOnly/SameSite=Lax (12 h); bloqueio por tentativas; *rate limiting* em login, webhook e API.
* Webhook autenticado por segredo compartilhado (`x-webhook-secret`, comparação em tempo constante), validado, idempotente e **não exposto** pelo nginx; a `apikey` do corpo é descartada antes de gravar.
* Perfis Administrador / Técnico / Somente leitura; auditoria de login, exclusões, ações do WhatsApp e decisões de orçamento.
* Prisma (consultas parametrizadas) contra SQL injection; React escapa saída contra XSS; CSP e demais cabeçalhos no nginx; links de ofertas só `http(s)`.
* O sistema **não possui upload de arquivos** (superfície eliminada); mídias recebidas no WhatsApp não são baixadas, apenas o tipo e a legenda são registrados.
* Portas publicadas somente em `127.0.0.1`. Não exponha à internet sem HTTPS (defina `COOKIE_SECURE=true`) e sem proxy reverso próprio.
* **Retenção:** mensagens com mais de 180 dias (configurável em *Configurações*) são apagadas toda madrugada, exceto as vinculadas a tarefas/chamados; eventos técnicos de webhook são mantidos por 30 dias; administradores podem excluir mensagens individualmente. A Evolution API está configurada para **não** guardar mensagens/contatos/chats, só os dados da sessão.

## 9. Limitações conhecidas

1. **Docker não foi executado de ponta a ponta no ambiente de desenvolvimento** (veja docs/TESTES.md); rode `scripts/smoke-test.ps1` após o primeiro `up`.
2. **Evolution API não testada com conta real.** Rotas/corpos conferidos só parcialmente com a documentação; a imagem `v2.3.7` foi escolhida por ser a última estável sem licença. Healthcheck do contêiner usa `wget` (esperado na imagem); se ficar `unhealthy` mesmo funcionando, ajuste o teste em `docker-compose.yml`.
3. Risco inerente de bloqueio da conta (conexão não oficial).
4. Mídias (imagem, áudio, documento) não são baixadas; áudios não são transcritos.
5. **IA (Gemini) não testada com a API real**: os testes usam um provedor simulado; o formato da chamada REST do Gemini e o nome do modelo (`GEMINI_MODEL`) precisam ser conferidos na primeira execução. A cota/limites do plano gratuito são do Google e podem mudar.
6. Relatórios agendados não são recuperados retroativamente se o computador estiver desligado.
7. O banco da Evolution e o do sistema compartilham a mesma instância PostgreSQL (bancos e usuários separados). O script de criação (`infra/postgres/init-databases.sh`) só roda na **primeira** criação do volume; se já houver um volume antigo do PostgreSQL, crie os bancos/usuários manualmente.
8. Interface sem testes automatizados de ponta a ponta (apenas verificação manual com navegador).
9. Notificações são internas (sino); não há e-mail/push.

## 10. Integrações que dependem de configuração adicional

* **Evolution API/WhatsApp:** número secundário, leitura do QR Code e, se desejar relatórios, o JID do grupo de destino (aparece na Central de mensagens depois que alguém escreve no grupo).
* **HTTPS/acesso remoto:** não incluído (o sistema é local). Se precisar, use um proxy reverso próprio e `COOKIE_SECURE=true`.
* **IA/Gemini:** chave gratuita do Google AI Studio (`GEMINI_API_KEY`) e ativação em *Assistente IA*.
* **Lojas (Mercado Livre, Magazine Luiza):** apenas links de busca; sem integração por API.
