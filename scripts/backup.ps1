# Backup do PostgreSQL no Windows (PowerShell 5.1+). Requer Docker Desktop com os serviços em execução.
# Uso: .\scripts\backup.ps1
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
New-Item -ItemType Directory -Force -Path backups | Out-Null

foreach ($db in 'central', 'evolution') {
  $file = "backups\$db-$stamp.sql"
  # cmd /c preserva os bytes do dump (o pipeline do PowerShell 5 re-codifica a saída)
  cmd /c "docker compose exec -T postgres pg_dump -U postgres --clean --if-exists --no-owner --no-privileges $db > $file"
  if ($LASTEXITCODE -ne 0 -or -not (Select-String -Path $file -Pattern 'PostgreSQL database dump' -Quiet)) {
    Remove-Item $file -ErrorAction SilentlyContinue
    throw "Backup do banco '$db' falhou."
  }
  Write-Host "OK: $file"
}
# Retenção: mantém os 14 mais recentes de cada banco
foreach ($n in 'central', 'evolution') {
  Get-ChildItem "backups\$n-*.sql" | Sort-Object LastWriteTime -Descending | Select-Object -Skip 14 | Remove-Item
}
