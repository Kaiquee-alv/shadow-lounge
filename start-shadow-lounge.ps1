$ErrorActionPreference = "Stop"
$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $projectDir

$maxAttempts = 30
for ($attempt = 1; $attempt -le $maxAttempts; $attempt++) {
  try {
    docker info | Out-Null
    break
  } catch {
    if ($attempt -eq $maxAttempts) {
      Write-Error "O Docker Desktop não ficou disponível a tempo. Abra o Docker Desktop e execute este script novamente."
    }
    Start-Sleep -Seconds 5
  }
}

docker compose up -d --build
Write-Host "SHADOW LOUNGE iniciado em http://localhost:3000"
