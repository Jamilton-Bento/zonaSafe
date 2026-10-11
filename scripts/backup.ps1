# Backup do PostgreSQL no Windows (PowerShell). Requer Docker Desktop com os serviços em execução.
# Uso: .\scripts\backup.ps1
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
New-Item -ItemType Directory -Force -Path backups | Out-Null

foreach ($pair in @(@('central','central'), @('evolution','evolution'))) {
  $db = $pair[0]; $name = $pair[1]
  $file = "backups/$name-$stamp.sql"
  # Gera como bytes UTF-8 sem BOM (evita corromper o dump no PowerShell 5)
  docker compose exec -T postgres pg_dump -U postgres --clean --if-exists --no-owner --no-privileges $db |
    Out-File -Encoding utf8NoBOM -FilePath $file 2>$null
  if ($LASTEXITCODE -ne 0 -or -not (Select-String -Path $file -Pattern 'PostgreSQL database dump' -Quiet)) {
    Remove-Item $file -ErrorAction SilentlyContinue
    throw "Backup do banco '$db' falhou."
  }
  Write-Host "OK: $file"
}
# Retenção: mantém os 14 mais recentes de cada banco
foreach ($n in 'central','evolution') {
  Get-ChildItem "backups/$n-*.sql" | Sort-Object LastWriteTime -Descending | Select-Object -Skip 14 | Remove-Item
}
