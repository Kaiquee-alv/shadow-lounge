[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$installRoot = Join-Path $env:LOCALAPPDATA "ShadowLounge\PrinterAgent"
$agentSource = Join-Path $PSScriptRoot "printer-agent.ps1"
$agentTarget = Join-Path $installRoot "printer-agent.ps1"
$configPath = Join-Path $installRoot "agent-config.json"
$tokenPath = Join-Path $installRoot "agent-token.bin"
$taskName = "ShadowLoungePrinterAgent"

if (!(Test-Path -LiteralPath $agentSource)) { throw "Arquivo printer-agent.ps1 não encontrado na pasta deste instalador." }

$serverInput = Read-Host "URL HTTPS do sistema (ex.: https://caixa.seudominio.com)"
try { $serverUri = [Uri]$serverInput } catch { throw "URL inválida." }
if ($serverUri.Scheme -ne "https" -or !$serverUri.IsAbsoluteUri) { throw "Por segurança, a ponte aceita somente uma URL HTTPS válida." }
$serverUrl = $serverInput.TrimEnd('/')

$printers = @(Get-Printer | Sort-Object Name)
if ($printers.Count -eq 0) { throw "O Windows não encontrou impressoras instaladas. Instale e teste a KP-IM602 primeiro." }
Write-Host "Impressoras instaladas:" -ForegroundColor Cyan
for ($i = 0; $i -lt $printers.Count; $i++) { Write-Host ("  {0}. {1}" -f ($i + 1), $printers[$i].Name) }
$printerName = Read-Host "Digite o número da KP-IM602 ou o nome exato da impressora"
if ($printerName -match '^\d+$' -and [int]$printerName -ge 1 -and [int]$printerName -le $printers.Count) {
  $printerName = $printers[[int]$printerName - 1].Name
} else {
  $selected = $printers | Where-Object { $_.Name -eq $printerName } | Select-Object -First 1
  if (!$selected) { throw "Nome de impressora não encontrado no Windows." }
  $printerName = $selected.Name
}

$pairingCode = Read-Host "Digite o código temporário exibido no sistema (válido por 10 minutos)"
if ($pairingCode.Length -lt 20 -or $pairingCode.Length -gt 60) { throw "Código temporário inválido." }
$pairBody = @{
  pairingCode = $pairingCode
  computerName = $env:COMPUTERNAME
  printerName = $printerName
} | ConvertTo-Json -Compress
$pairingCode = $null
try {
  $pairResult = Invoke-RestMethod -Method Post -Uri "$serverUrl/api/printer/pair" -ContentType "application/json" -Body $pairBody -TimeoutSec 20
} catch {
  throw "Não foi possível parear com o sistema. Confira a URL, a conexão e gere um código novo. Detalhe: $($_.Exception.Message)"
}
if ([string]::IsNullOrWhiteSpace([string]$pairResult.agentToken)) { throw "O servidor não retornou o token do agente." }

New-Item -ItemType Directory -Path $installRoot -Force | Out-Null
$identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
& icacls.exe $installRoot /inheritance:r /grant:r "$($identity):(OI)(CI)F" "SYSTEM:(OI)(CI)F" | Out-Null
Copy-Item -LiteralPath $agentSource -Destination $agentTarget -Force
@{ serverUrl = $serverUrl; printerName = $printerName; pairedAt = (Get-Date).ToString('o') } |
  ConvertTo-Json -Depth 3 | Set-Content -LiteralPath $configPath -Encoding UTF8

Add-Type -AssemblyName System.Security
$tokenBytes = [Text.Encoding]::UTF8.GetBytes([string]$pairResult.agentToken)
$encryptedToken = [Security.Cryptography.ProtectedData]::Protect($tokenBytes, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
[IO.File]::WriteAllBytes($tokenPath, $encryptedToken)
[Array]::Clear($tokenBytes, 0, $tokenBytes.Length)
$pairResult.agentToken = $null

$powerShellExe = (Get-Process -Id $PID).Path
$arguments = '-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "{0}" -Run' -f $agentTarget
$action = New-ScheduledTaskAction -Execute $powerShellExe -Argument $arguments
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $identity
$principal = New-ScheduledTaskPrincipal -UserId $identity -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
Start-ScheduledTask -TaskName $taskName

Write-Host ""
Write-Host "Agente configurado e iniciado." -ForegroundColor Green
Write-Host "Windows: $env:COMPUTERNAME"
Write-Host "Impressora: $printerName"
Write-Host "O token foi protegido com DPAPI para este usuário e não é exibido." 
Write-Host "A tarefa '$taskName' iniciará o agente a cada entrada neste Windows."
Write-Host "Para reinstalar ou trocar a impressora, gere um novo código no sistema e execute este instalador novamente."
