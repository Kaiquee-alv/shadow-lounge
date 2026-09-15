$ErrorActionPreference = "Stop"
$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$startScript = Join-Path $projectDir "start-shadow-lounge.ps1"
$taskName = "SHADOW LOUNGE - Servidor"

$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$startScript`""
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Hours 0) -StartWhenAvailable
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description "Inicia o Docker Compose da SHADOW LOUNGE ao entrar no Windows" -Force | Out-Null

Write-Host "Inicialização automática instalada: $taskName"
Write-Host "No Docker Desktop, ative Settings > General > Start Docker Desktop when you sign in."
Write-Host "Para remover depois: Unregister-ScheduledTask -TaskName '$taskName' -Confirm:`$false"
