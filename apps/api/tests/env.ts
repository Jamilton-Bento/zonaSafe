// Ambiente de TESTES: banco dedicado e segredos descartáveis. Nenhum dado real.
process.env.NODE_ENV = 'test';
process.env.TZ = 'America/Sao_Paulo';
process.env.DATABASE_URL ??= 'postgresql://central:central_test@localhost:5432/central_test?schema=public';
process.env.JWT_SECRET = 'teste-teste-teste-teste-teste-teste-123456';
process.env.WEBHOOK_SECRET = 'segredo-webhook-somente-para-testes-0001';
process.env.EVOLUTION_API_KEY = 'chave-de-teste';
process.env.EVOLUTION_INSTANCE = 'instancia-teste';
process.env.WA_MIN_SEND_INTERVAL_MS = '0';
process.env.WA_CONNECT_COOLDOWN_MS = '0';
process.env.ENABLE_SCHEDULER = 'false';
process.env.GEMINI_API_KEY = 'chave-gemini-de-teste';
process.env.AI_MIN_INTERVAL_MS = '0';
process.env.AI_DAILY_LIMIT = '5';
