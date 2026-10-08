<#
Project Library: SharePoint sync (runs on your work PC, with your own login)

What it does
  1. Looks through your OneDrive-synced copy of the KCGM Controlled Library.
  2. Finds the documents named in watch-list.txt (exact numbers, or patterns with *).
  3. For each, takes the highest revision (files are named NUMBER_REV.pdf, e.g. 2000-F00-LST-EL-20002_0.pdf).
  4. Uploads any revision not sent before into the app's GitHub repository (uploads/), exactly as the app's
     Upload button does. GitHub then files it into the library within a few minutes.

First run asks for: the synced library folder, and a GitHub key (fine-grained token, Contents read and write on
bijankle/ProjectLibrary only). Both are saved for your Windows user only (the key encrypted by Windows).
Run it again whenever you like, or schedule it (see README.txt). Nothing is ever deleted from SharePoint.
#>
param([switch]$DryRun, [switch]$Reset)
$ErrorActionPreference = "Stop"
$Repo   = "bijankle/ProjectLibrary"
$Here   = Split-Path -Parent $MyInvocation.MyCommand.Path
$State  = Join-Path $env:APPDATA "ProjectLibrarySync"
New-Item -ItemType Directory -Force -Path $State | Out-Null
$CfgF   = Join-Path $State "config.json"; $KeyF = Join-Path $State "github.key"; $SentF = Join-Path $State "sent.json"
if ($Reset) { Remove-Item $CfgF, $KeyF, $SentF -ErrorAction SilentlyContinue; Write-Host "Settings cleared." }

# ---------- settings ----------
$cfg = if (Test-Path $CfgF) { Get-Content $CfgF -Raw | ConvertFrom-Json } else { [pscustomobject]@{ root = "" } }
if (-not $cfg.root -or -not (Test-Path $cfg.root)) {
  Add-Type -AssemblyName System.Windows.Forms
  $d = New-Object System.Windows.Forms.FolderBrowserDialog
  $d.Description = "Pick the synced 'KCGM Controlled Library' folder (SharePoint > Sync puts it under your company name in File Explorer)"
  if ($d.ShowDialog() -ne "OK") { Write-Host "No folder picked."; exit 1 }
  $cfg.root = $d.SelectedPath; $cfg | ConvertTo-Json | Set-Content $CfgF
}
if (-not (Test-Path $KeyF)) {
  $s = Read-Host "Paste your GitHub key (it stays encrypted on this PC)" -AsSecureString
  $s | ConvertFrom-SecureString | Set-Content $KeyF
}
$key = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR((Get-Content $KeyF | ConvertTo-SecureString)))
$sent = @{}; if (Test-Path $SentF) { (Get-Content $SentF -Raw | ConvertFrom-Json).psobject.Properties | ForEach-Object { $sent[$_.Name] = $_.Value } }

# ---------- what to look for ----------
$watch = Get-Content (Join-Path $Here "watch-list.txt") | ForEach-Object { ($_ -replace "#.*$", "").Trim() } | Where-Object { $_ }
if (-not $watch) { Write-Host "watch-list.txt is empty."; exit 0 }

# revision order as the app: letters (before Rev 0) < numbers; 1A after 1
function RevKey($r) { $r = "$r".ToUpper(); if ($r -match '^(\d+)([A-Z]?)$') { return "1{0:D4}{1}" -f [int]$Matches[1], $Matches[2] } return "0$r" }

Write-Host "Searching $($cfg.root) ..."
$found = @{}
Get-ChildItem -Path $cfg.root -Recurse -File -Filter *.pdf -ErrorAction SilentlyContinue | ForEach-Object {
  if ($_.Name -match '^(?<num>[A-Za-z0-9][A-Za-z0-9-]{4,60})_(?:Rev)?(?<rev>[A-Za-z0-9]{1,4})\.pdf$') {
    $num = $Matches.num.ToUpper(); $rev = $Matches.rev.ToUpper()
    if (-not ($watch | Where-Object { $num -like $_.ToUpper() })) { return }
    if (-not $found[$num] -or (RevKey $rev) -gt (RevKey $found[$num].rev)) { $found[$num] = @{ rev = $rev; file = $_ } }
  }
}
if (-not $found.Count) { Write-Host "None of the watched documents were found. Is the folder synced (green ticks in File Explorer)?"; exit 0 }

# ---------- upload what's new ----------
$H = @{ Authorization = "Bearer $key"; Accept = "application/vnd.github+json"; "X-GitHub-Api-Version" = "2022-11-28" }
function Put($path, [byte[]]$bytes, $msg) {
  $url = "https://api.github.com/repos/$Repo/contents/" + (($path -split "/") | ForEach-Object { [uri]::EscapeDataString($_) }) -join "/"
  $body = @{ message = $msg; content = [Convert]::ToBase64String($bytes) } | ConvertTo-Json
  Invoke-RestMethod -Method Put -Uri $url -Headers $H -Body $body -ContentType "application/json" | Out-Null
}
$n = 0
foreach ($num in ($found.Keys | Sort-Object)) {
  $f = $found[$num]; $rev = $f.rev
  if ($sent[$num] -and (RevKey $sent[$num]) -ge (RevKey $rev)) { Write-Host "  $num Rev $rev  already sent"; continue }
  # a file still downloading from SharePoint ("online only") is fetched by opening it; skip it if it's locked
  try { $bytes = [IO.File]::ReadAllBytes($f.file.FullName) } catch { Write-Host "  $num Rev $rev  couldn't be read yet (still syncing?)"; continue }
  if ($bytes.Length -gt 95MB) { Write-Host "  $num Rev $rev  too big for GitHub ($([math]::Round($bytes.Length/1MB)) MB)"; continue }
  if ($DryRun) { Write-Host "  $num Rev $rev  would upload ($([math]::Round($bytes.Length/1MB,1)) MB)"; continue }
  $base = "uploads/${num}_Rev$rev"
  $note = @{ number = $num; rev = $rev; uploaded = (Get-Date).ToUniversalTime().ToString("o"); file = $f.file.Name; title = "" } | ConvertTo-Json
  try {
    Put "$base.json" ([Text.Encoding]::UTF8.GetBytes($note)) "Upload $num Rev $rev (note)"
    Put "$base.pdf" $bytes "Upload $num Rev $rev"
    $sent[$num] = $rev; $sent | ConvertTo-Json | Set-Content $SentF; $n++
    Write-Host "  $num Rev $rev  uploaded" -ForegroundColor Green
  } catch {
    $code = $_.Exception.Response.StatusCode.value__
    $why = switch ($code) { 401 { "the GitHub key was refused (run with -Reset to enter a new one)" } 404 { "the key can't see $Repo" } 403 { "the key can't write, or GitHub's hourly limit is used up" } 422 { "that revision is already waiting in uploads" } default { $_.Exception.Message } }
    Write-Host "  $num Rev $rev  FAILED: $why" -ForegroundColor Red
    if ($code -in 401, 403, 404) { break }
  }
}
Write-Host ""
Write-Host "$n uploaded. They appear in the app's Sources tab a few minutes after GitHub has filed them."
