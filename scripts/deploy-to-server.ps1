$ErrorActionPreference = "Stop"

Write-Host "REFUSED: the legacy PowerShell deployment path is disabled because it bypasses the verified backup and source-snapshot gates." -ForegroundColor Red
Write-Host "Use scripts/deploy.sh from an approved release environment after the full release gate passes." -ForegroundColor Yellow
exit 2
