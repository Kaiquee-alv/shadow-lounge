[CmdletBinding()]
param(
  [switch]$Run
)

$ErrorActionPreference = "Stop"
$root = Join-Path $env:LOCALAPPDATA "ShadowLounge\PrinterAgent"
$configPath = Join-Path $root "agent-config.json"
$tokenPath = Join-Path $root "agent-token.bin"
$logPath = Join-Path $root "agent.log"

function Write-AgentLog([string]$Message) {
  $line = "{0} {1}" -f ([DateTime]::Now.ToString("yyyy-MM-dd HH:mm:ss")), $Message
  Add-Content -LiteralPath $logPath -Value $line -Encoding UTF8
  $maxBytes = 1MB
  if ((Get-Item -LiteralPath $logPath).Length -gt $maxBytes) {
    Get-Content -LiteralPath $logPath -Tail 500 | Set-Content -LiteralPath "$logPath.tmp" -Encoding UTF8
    Move-Item -LiteralPath "$logPath.tmp" -Destination $logPath -Force
  }
}

function Get-AgentSettings {
  if (!(Test-Path -LiteralPath $configPath) -or !(Test-Path -LiteralPath $tokenPath)) {
    throw "Agente não configurado. Execute install-printer-agent.ps1 novamente."
  }
  $config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
  if ($config.serverUrl -notmatch '^https://') { throw "O agente exige uma URL HTTPS válida." }
  Add-Type -AssemblyName System.Security
  $protected = [IO.File]::ReadAllBytes($tokenPath)
  $plain = [Security.Cryptography.ProtectedData]::Unprotect($protected, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
  $token = [Text.Encoding]::UTF8.GetString($plain)
  [Array]::Clear($plain, 0, $plain.Length)
  if ([string]::IsNullOrWhiteSpace($token)) { throw "Token local inválido; faça o pareamento novamente." }
  return @{ Config = $config; Token = $token; BaseUrl = $config.serverUrl.TrimEnd('/') }
}

function Get-RawPrinterType {
  if ("ShadowLounge.RawPrinter" -as [type]) { return }
  $source = @"
using System;
using System.Runtime.InteropServices;
namespace ShadowLounge {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct DOCINFO {
    public string pDocName;
    public string pOutputFile;
    public string pDataType;
  }
  public static class RawPrinter {
    [DllImport("winspool.drv", EntryPoint="OpenPrinterW", SetLastError=true, CharSet=CharSet.Unicode)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool OpenPrinter(string printerName, out IntPtr printer, IntPtr defaults);
    [DllImport("winspool.drv", EntryPoint="ClosePrinter", SetLastError=true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool ClosePrinter(IntPtr printer);
    [DllImport("winspool.drv", EntryPoint="StartDocPrinterW", SetLastError=true, CharSet=CharSet.Unicode)]
    public static extern int StartDocPrinter(IntPtr printer, int level, ref DOCINFO docInfo);
    [DllImport("winspool.drv", EntryPoint="EndDocPrinter", SetLastError=true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool EndDocPrinter(IntPtr printer);
    [DllImport("winspool.drv", EntryPoint="StartPagePrinter", SetLastError=true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool StartPagePrinter(IntPtr printer);
    [DllImport("winspool.drv", EntryPoint="EndPagePrinter", SetLastError=true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool EndPagePrinter(IntPtr printer);
    [DllImport("winspool.drv", EntryPoint="WritePrinter", SetLastError=true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool WritePrinter(IntPtr printer, byte[] bytes, int count, out int written);
  }
}
"@
  Add-Type -TypeDefinition $source -Language CSharp
}

function ConvertTo-ReceiptBytes($Payload) {
  Get-RawPrinterType
  try { Add-Type -AssemblyName System.Text.Encoding.CodePages -ErrorAction SilentlyContinue } catch { }
  try { [Text.Encoding]::RegisterProvider([Text.CodePagesEncodingProvider]::Instance) } catch { }
  $encoding = [Text.Encoding]::GetEncoding(850, [Text.EncoderFallback]::ReplacementFallback, [Text.DecoderFallback]::ReplacementFallback)
  $stream = New-Object IO.MemoryStream
  $write = { param([byte[]]$Bytes) $stream.Write($Bytes, 0, $Bytes.Length) }
  $esc = [byte]0x1B
  $gs = [byte]0x1D
  & $write ([byte[]]@($esc, 0x40, $esc, 0x74, 2)) # ESC t 2: página PC850 (acentos em português)
  foreach ($line in @($Payload.lines)) {
    if ($null -eq $line) { continue }
    if ($line.separator) {
      & $write ([byte[]]@($esc, 0x61, 0, $esc, 0x45, 0, $esc, 0x4D, 0, $gs, 0x21, 0))
      & $write ($encoding.GetBytes(("-" * 42)))
      & $write ([byte[]]@(0x0A))
      continue
    }
    $text = [string]$line.text
    if ($text.Length -gt 4000) { throw "Texto de impressão excede o limite permitido." }
    $alignment = if ($line.align -eq "center") { 1 } else { 0 }
    $bold = if ($line.bold) { 1 } else { 0 }
    $size = [string]$line.size
    $font = if ($size -eq "small") { 1 } else { 0 }
    # ESC/POS GS ! 0x11 = 2x; 0x22 = 3x width and height.
    $scale = if ($size -eq "xlarge") { 0x22 } elseif ($size -eq "large") { 0x11 } else { 0 }
    & $write ([byte[]]@($esc, 0x61, $alignment, $esc, 0x45, $bold, $esc, 0x4D, $font, $gs, 0x21, $scale))
    $width = if ($size -eq "xlarge") { 14 } elseif ($size -eq "large") { 21 } else { 42 }
    foreach ($rawLine in ($text -split "`r?`n")) {
      if ($rawLine.Length -eq 0) {
        & $write ([byte[]]@(0x0A))
        continue
      }
      for ($offset = 0; $offset -lt $rawLine.Length; $offset += $width) {
        $count = [Math]::Min($width, $rawLine.Length - $offset)
        & $write ($encoding.GetBytes($rawLine.Substring($offset, $count)))
        & $write ([byte[]]@(0x0A))
      }
    }
  }
  # Alimenta apenas 1 linha e aciona o cortador automático (sem janela de impressão).
  & $write ([byte[]]@($esc, 0x61, 0, $esc, 0x45, 0, $esc, 0x4D, 0, $gs, 0x21, 0, 0x0A, $gs, 0x56, 66, 0))
  $result = $stream.ToArray()
  $stream.Dispose()
  return ,$result
}

function Send-RawReceipt([string]$PrinterName, [byte[]]$Bytes) {
  Get-RawPrinterType
  $printer = [IntPtr]::Zero
  if (![ShadowLounge.RawPrinter]::OpenPrinter($PrinterName, [ref]$printer, [IntPtr]::Zero)) {
    throw "Não foi possível abrir a impressora '$PrinterName' (Windows: $([Runtime.InteropServices.Marshal]::GetLastWin32Error()))."
  }
  $documentStarted = $false
  $pageStarted = $false
  try {
    $doc = New-Object ShadowLounge.DOCINFO
    $doc.pDocName = "Shadow Lounge - recibo"
    $doc.pOutputFile = $null
    $doc.pDataType = "RAW"
    if ([ShadowLounge.RawPrinter]::StartDocPrinter($printer, 1, [ref]$doc) -eq 0) {
      throw "O Windows não iniciou o trabalho de impressão (código $([Runtime.InteropServices.Marshal]::GetLastWin32Error()))."
    }
    $documentStarted = $true
    if (![ShadowLounge.RawPrinter]::StartPagePrinter($printer)) { throw "Não foi possível iniciar a página de impressão." }
    $pageStarted = $true
    $written = 0
    if (![ShadowLounge.RawPrinter]::WritePrinter($printer, $Bytes, $Bytes.Length, [ref]$written) -or $written -ne $Bytes.Length) {
      throw "O Windows não aceitou todos os dados de impressão (código $([Runtime.InteropServices.Marshal]::GetLastWin32Error()))."
    }
    if (![ShadowLounge.RawPrinter]::EndPagePrinter($printer)) { throw "O Windows não concluiu a página de impressão." }
    $pageStarted = $false
    if (![ShadowLounge.RawPrinter]::EndDocPrinter($printer)) { throw "O Windows não concluiu o trabalho de impressão." }
    $documentStarted = $false
  } finally {
    if ($pageStarted) { [void][ShadowLounge.RawPrinter]::EndPagePrinter($printer) }
    if ($documentStarted) { [void][ShadowLounge.RawPrinter]::EndDocPrinter($printer) }
    [void][ShadowLounge.RawPrinter]::ClosePrinter($printer)
  }
}

function Send-JobResult($Agent, [int]$JobId, [string]$Status, [string]$ErrorMessage) {
  $uri = "$($Agent.BaseUrl)/api/printer/jobs/$JobId/result"
  $body = @{ status = $Status }
  if ($ErrorMessage) { $body.error = $ErrorMessage.Substring(0, [Math]::Min(2000, $ErrorMessage.Length)) }
  Invoke-RestMethod -Method Post -Uri $uri -Headers @{ Authorization = "Bearer $($Agent.Token)" } -ContentType "application/json" -Body ($body | ConvertTo-Json -Compress) -TimeoutSec 15 | Out-Null
}

if (!$Run) { throw "Execute o agente pela tarefa agendada criada por install-printer-agent.ps1." }

$agent = Get-AgentSettings
Write-AgentLog "Agente iniciado; servidor $($agent.BaseUrl); impressora '$($agent.Config.printerName)'"
while ($true) {
  try {
    $response = Invoke-RestMethod -Method Post -Uri "$($agent.BaseUrl)/api/printer/jobs/next" -Headers @{ Authorization = "Bearer $($agent.Token)" } -ContentType "application/json" -Body "{}" -TimeoutSec 20
    if ($null -eq $response.job) {
      Start-Sleep -Milliseconds 2500
      continue
    }
    $job = $response.job
    $printSucceeded = $false
    try {
      $bytes = ConvertTo-ReceiptBytes $job.payload
      Send-RawReceipt -PrinterName ([string]$agent.Config.printerName) -Bytes $bytes
      $printSucceeded = $true
    } catch {
      $message = $_.Exception.Message
      Write-AgentLog "Falha ao enviar trabalho $($job.id) ao spooler: $message"
      try { Send-JobResult -Agent $agent -JobId ([int]$job.id) -Status "failed" -ErrorMessage $message }
      catch { Write-AgentLog "Não foi possível confirmar falha do trabalho $($job.id); o estado poderá ficar incerto: $($_.Exception.Message)" }
    }
    if ($printSucceeded) {
      try {
        Send-JobResult -Agent $agent -JobId ([int]$job.id) -Status "printed" -ErrorMessage ""
        Write-AgentLog "Trabalho $($job.id) enviado ao spooler do Windows."
      } catch {
        # Nunca envia status failed após envio ao spooler: um ACK perdido não pode provocar duplicata.
        Write-AgentLog "Trabalho $($job.id) foi enviado ao spooler, mas o ACK falhou; o estado poderá ficar incerto: $($_.Exception.Message)"
      }
    }
  } catch {
    Write-AgentLog "Falha de comunicação/agente: $($_.Exception.Message)"
    Start-Sleep -Seconds 5
  }
}
