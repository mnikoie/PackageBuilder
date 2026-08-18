<#
  PackageBuilder — بالا آوردن و بستنِ سرورِ رابطِ کاربری.

  این فایل مغزِ کار است؛ start-server.bat و stop-server.bat فقط صداش می‌زنند.

  چرا پیام‌ها انگلیسی‌اند: ترمینال‌های ویندوز (هم Windows Terminal، هم کنسولِ
  قدیمی) متنِ راست‌به‌چپ را نمی‌چینند — حروف را می‌چسبانند ولی ترتیب را برعکس
  نشان می‌دهند. آزمایش شد و هیچ‌کدام خوانا نبود، پس خروجیِ *پنجرهٔ ترمینال*
  انگلیسی شد. رابطِ کاربری در مرورگر همچنان کاملاً فارسی است.

  استفادهٔ مستقیم:
      pwsh -File server-control.ps1 -Action start  [-Port 4600]
      pwsh -File server-control.ps1 -Action stop   [-Port 4600]
      pwsh -File server-control.ps1 -Action status [-Port 4600]

  قاعدهٔ «بی‌مدرک ادعا نکن» اینجا هم رعایت شده: مرجعِ «بالاست/خاموش است»
  خودِ سیستم است (کسی که واقعاً روی پورت گوش می‌دهد)، نه حدس و نه فایلِ pid.
#>
param(
  [ValidateSet('start', 'stop', 'status')]
  [string]$Action = 'status',
  [int]$Port = 4600
)

$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new() } catch { }

$root = Split-Path -Parent $MyInvocation.MyCommand.Definition
$url = "http://127.0.0.1:$Port/"

# ── شمارهٔ پروسه‌ای که واقعاً روی این پورت گوش می‌دهد (یا $null) ──────────────
function Get-ServerPid {
  param([int]$Port)
  try {
    $conn = Get-NetTCPConnection -LocalAddress '127.0.0.1' -LocalPort $Port -State Listen -ErrorAction Stop
    if ($conn) { return [int](@($conn)[0].OwningProcess) }
  } catch {
    # روی سیستمی که این cmdlet را ندارد، netstat جوابِ همان سؤال را می‌دهد
    $line = @(netstat -ano -p TCP | Select-String -Pattern "127\.0\.0\.1:$Port\s+.*LISTENING")
    if ($line.Count -gt 0) { return [int](($line[0].Line.Trim() -split '\s+')[-1]) }
  }
  return $null
}

# ── پنجرهٔ cmdی که این node را باز کرده (تا با بستنِ سرور، پنجره‌اش هم برود) ──
function Get-OwnerWindowPid {
  param([int]$ServerPid)
  try {
    $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$ServerPid" -ErrorAction Stop
    if (-not $proc) { return $null }
    $parent = Get-CimInstance Win32_Process -Filter "ProcessId=$($proc.ParentProcessId)" -ErrorAction Stop
    # فقط اگر واقعاً پنجرهٔ خودِ ما باشد: cmd ای که همین cli.mjs را اجرا کرده.
    # با عنوانِ پنجره سراغش نرو — عنوان مالِ میزبانِ کنسول است و می‌تواند به
    # کلِ Windows Terminal بخورد.
    if ($parent -and $parent.Name -eq 'cmd.exe' -and $parent.CommandLine -like '*cli.mjs*') {
      return [int]$parent.ProcessId
    }
  } catch { }
  return $null
}

# ── بالا آوردن ────────────────────────────────────────────────────────────────
function Start-PbServer {
  $running = Get-ServerPid -Port $Port
  if ($running) {
    Write-Host ""
    Write-Host "[i] Already running (PID $running) - $url"
    Write-Host "    To stop it: stop-server.bat"
    Start-Process $url
    return 0
  }

  if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host ""
    Write-Host "[x] 'node' not found. Node.js is not installed, or not on PATH."
    return 1
  }

  $cli = Join-Path $root 'src\cli.mjs'
  if (-not (Test-Path $cli)) {
    Write-Host ""
    Write-Host "[x] src\cli.mjs is not next to this script. Keep these files in the PackageBuilder root."
    return 1
  }

  Write-Host ""
  Write-Host "[>] Starting the server on port $Port ..."

  # پنجرهٔ جداگانه و *قابلِ دیدن* — قاعدهٔ دوم: هیچ چیزی پنهان اجرا نشود.
  # cmd /k یعنی اگر سرور خطا داد، پنجره باز می‌ماند و متنِ خطا را می‌بینی.
  $inner = 'title PackageBuilder Server {0} && node "src\cli.mjs" serve --port {0}' -f $Port
  Start-Process -FilePath 'cmd.exe' -ArgumentList '/k', $inner -WorkingDirectory $root | Out-Null

  for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Seconds 1
    $serverPid = Get-ServerPid -Port $Port
    if ($serverPid) {
      Write-Host ""
      Write-Host "[ok] Up (PID $serverPid) - $url"
      Write-Host "     The server's own window is titled 'PackageBuilder Server $Port' - leave it open."
      Write-Host "     To stop: stop-server.bat"
      Start-Process $url
      return 0
    }
  }

  Write-Host ""
  Write-Host "[x] Did not come up within 20s. Check the 'PackageBuilder Server $Port' window - the error is there."
  return 1
}

# ── بستن ──────────────────────────────────────────────────────────────────────
function Stop-PbServer {
  $serverPid = Get-ServerPid -Port $Port
  if (-not $serverPid) {
    Write-Host ""
    Write-Host "[i] Nothing is listening on port $Port - the server is already stopped."
    return 0
  }

  Write-Host ""
  Write-Host "[>] Stopping the server on port $Port (PID $serverPid) ..."

  # پنجره را می‌بندیم؛ /T بچه‌هایش را هم می‌برد (خودِ node و پاورشلِ ترمینالش).
  # اگر پنجرهٔ ما را پیدا نکردیم، فقط خودِ سرور را با بچه‌هایش می‌بندیم.
  $windowPid = Get-OwnerWindowPid -ServerPid $serverPid
  if ($windowPid) { taskkill /PID $windowPid /T /F 2>&1 | Out-Null }
  taskkill /PID $serverPid /T /F 2>&1 | Out-Null

  # مدرک بخواه، به فرمان اعتماد نکن
  for ($i = 0; $i -lt 10; $i++) {
    Start-Sleep -Milliseconds 400
    if (-not (Get-ServerPid -Port $Port)) {
      Write-Host ""
      Write-Host "[ok] Stopped. Port $Port is free."
      return 0
    }
  }

  $left = Get-ServerPid -Port $Port
  Write-Host ""
  Write-Host "[x] Still up (PID $left). Kill it yourself:  taskkill /PID $left /T /F"
  return 1
}

# ── فقط گزارش، بی دست‌زدن ─────────────────────────────────────────────────────
function Show-PbStatus {
  $serverPid = Get-ServerPid -Port $Port
  Write-Host ""
  if ($serverPid) { Write-Host "[i] Server is up (PID $serverPid) - $url" }
  else { Write-Host "[i] Nothing is listening on port $Port - the server is stopped." }
  return 0
}

switch ($Action) {
  'start' { exit (Start-PbServer) }
  'stop' { exit (Stop-PbServer) }
  default { exit (Show-PbStatus) }
}
