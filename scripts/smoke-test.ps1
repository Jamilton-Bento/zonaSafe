# Teste de fumaça do ambiente Docker (Windows/PowerShell).
# Uso: .\scripts\smoke-test.ps1   (com os serviços iniciados)
$ErrorActionPreference = 'Continue'
Set-Location (Join-Path $PSScriptRoot '..')
$envs = @{}
Get-Content .env | Where-Object { $_ -match '^\s*[^#=]+=' } | ForEach-Object { $k, $v = $_ -split '=', 2; $envs[$k.Trim()] = $v.Trim() }
$port = if ($envs['WEB_PORT']) { $envs['WEB_PORT'] } else { '8081' }
$web = "http://127.0.0.1:$port"
$script:fail = $false
function Ok($m) { Write-Host "  [OK]    $m" -ForegroundColor Green }
function Bad($m) { Write-Host "  [FALHA] $m" -ForegroundColor Red; $script:fail = $true }

Write-Host '1) Contêineres e healthchecks'
foreach ($c in 'central-postgres','central-redis','central-evolution','central-api','central-web') {
  $s = docker inspect -f '{{.State.Status}}/{{if .State.Health}}{{.State.Health.Status}}{{else}}sem-healthcheck{{end}}' $c 2>$null
  if ($s -eq 'running/healthy') { Ok "$c ($s)" } else { Bad "$c ($s)" }
}
Write-Host '2) PostgreSQL'
$t = (docker compose exec -T postgres psql -U central -d central -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'").Trim()
if ([int]$t -ge 15) { Ok "banco 'central' com $t tabelas" } else { Bad "banco 'central' sem tabelas" }
Write-Host '3) Endpoints'
try { if ((Invoke-WebRequest "$web/healthz" -UseBasicParsing).StatusCode -eq 200) { Ok 'front-end /healthz' } } catch { Bad 'front-end /healthz' }
try { if ((Invoke-RestMethod "$web/api/health").db -eq 'ok') { Ok 'back-end /api/health com banco OK' } } catch { Bad 'back-end /api/health' }
try { Invoke-WebRequest "$web/api/tasks" -UseBasicParsing | Out-Null; Bad 'rota privada sem proteção' } catch { if ($_.Exception.Response.StatusCode.value__ -eq 401) { Ok 'rotas privadas exigem login (401)' } else { Bad 'resposta inesperada em /api/tasks' } }
Write-Host '4) Portas internas não publicadas'
foreach ($p in 5432, 6379, 3001) {
  $r = Test-NetConnection 127.0.0.1 -Port $p -WarningAction SilentlyContinue
  if ($r.TcpTestSucceeded) { Bad "porta $p acessível no host" } else { Ok "porta $p não publicada" }
}
Write-Host '5) Login e Evolution API'
try {
  $body = @{ email = $envs['ADMIN_EMAIL']; password = $envs['ADMIN_PASSWORD'] } | ConvertTo-Json
  Invoke-RestMethod "$web/api/auth/login" -Method Post -ContentType 'application/json' -Body $body -SessionVariable sess | Out-Null
  Ok 'login do administrador'
  $st = Invoke-RestMethod "$web/api/whatsapp/status" -WebSession $sess
  if ($st.apiReachable) { Ok "back-end alcança a Evolution API (conexão: $($st.connection))" } else { Bad 'back-end NÃO alcança a Evolution API (docker compose logs evolution-api)' }
} catch { Bad "login falhou: $($_.Exception.Message)" }
if ($script:fail) { Write-Host 'RESULTADO: há falhas.' -ForegroundColor Red; exit 1 } else { Write-Host 'RESULTADO: tudo certo.' -ForegroundColor Green }
