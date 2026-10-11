# Restaura um backup no Windows. OPERAÇÃO DESTRUTIVA: substitui o conteúdo do banco de destino.
# Uso: .\scripts\restore.ps1 -File backups\central-AAAAMMDD-HHMMSS.sql [-Database central]
param(
  [Parameter(Mandatory = $true)][string]$File,
  [string]$Database = 'central'
)
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')
if (-not (Test-Path $File)) { throw "Arquivo não encontrado: $File" }
Write-Host "ATENÇÃO: isto vai APAGAR e recriar o conteúdo do banco '$Database'." -ForegroundColor Yellow
$ans = Read-Host 'Digite RESTAURAR para continuar'
if ($ans -ne 'RESTAURAR') { Write-Host 'Cancelado.'; exit 1 }
docker compose stop api
$exists = docker compose exec -T postgres psql -U postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$Database'"
if (-not $exists) { docker compose exec -T postgres createdb -U postgres $Database }
cmd /c "docker compose exec -T postgres psql -U postgres -v ON_ERROR_STOP=1 -q -d $Database < $File"
if ($LASTEXITCODE -ne 0) { throw 'Falha na restauração.' }
docker compose start api
Write-Host "Restauração concluída em '$Database'."
