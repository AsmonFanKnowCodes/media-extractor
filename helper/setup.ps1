$ErrorActionPreference = 'Stop'
$helperRoot = $PSScriptRoot
$localDirectory = Join-Path $helperRoot '.local'
$binDirectory = Join-Path $helperRoot 'bin'
$nodeCommand = Get-Command node -ErrorAction Stop
if ([int]((& $nodeCommand.Source --version).TrimStart('v').Split('.')[0]) -lt 22) { throw 'Install Node.js 22 or later first.' }
New-Item -ItemType Directory -Path $localDirectory,$binDirectory -Force | Out-Null

function Get-VerifiedReleaseAsset($Repository, $AssetName, $Destination) {
  $release = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repository/releases/latest" -Headers @{ 'User-Agent' = 'Media-Extractor-Setup' }
  $asset = $release.assets | Where-Object { $_.name -eq $AssetName } | Select-Object -First 1
  if (-not $asset -or $asset.digest -notmatch '^sha256:([a-f0-9]{64})$') { throw "No SHA256-verified release asset found for $AssetName." }
  $expectedHash = $Matches[1]
  Write-Host "Downloading $AssetName from $Repository..."
  $partialFile = "$Destination.partial"
  Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $partialFile -UseBasicParsing
  $actualHash = (Get-FileHash -LiteralPath $partialFile -Algorithm SHA256).Hash
  if ($actualHash -ne $expectedHash) { throw "Checksum mismatch for $AssetName. Setup stopped." }
  Move-Item -LiteralPath $partialFile -Destination $Destination -Force
}

$downloader = Join-Path $binDirectory 'yt-dlp.exe'
Get-VerifiedReleaseAsset 'yt-dlp/yt-dlp' 'yt-dlp.exe' $downloader
$galleryDownloader=Join-Path $binDirectory 'gallery-dl.exe'
# This is the official nightly-build repository linked by gallery-dl's README.
Get-VerifiedReleaseAsset 'gdl-org/builds' 'gallery-dl_windows.exe' $galleryDownloader
$ffmpegCommand = Get-Command ffmpeg -ErrorAction SilentlyContinue
if ($ffmpegCommand) {
  $ffmpegDirectory = Split-Path -Parent $ffmpegCommand.Source
} elseif (Test-Path -LiteralPath (Join-Path $binDirectory 'ffmpeg.exe')) {
  $ffmpegDirectory = $binDirectory
} else {
  $archivePath = Join-Path $localDirectory 'ffmpeg.zip'
  Get-VerifiedReleaseAsset 'yt-dlp/FFmpeg-Builds' 'ffmpeg-master-latest-win64-gpl.zip' $archivePath
  $unpackDirectory = Join-Path $localDirectory 'ffmpeg-unpacked'
  Expand-Archive -LiteralPath $archivePath -DestinationPath $unpackDirectory -Force
  foreach ($fileName in @('ffmpeg.exe','ffprobe.exe')) {
    $binary = Get-ChildItem -LiteralPath $unpackDirectory -Recurse -Filter $fileName | Select-Object -First 1
    if (-not $binary) { throw "$fileName missing from release archive." }
    Copy-Item -LiteralPath $binary.FullName -Destination (Join-Path $binDirectory $fileName) -Force
  }
  $ffmpegDirectory = $binDirectory
}
# Respect the Windows Downloads known-folder location, including relocated folders.
$downloadsDirectory = (Get-ItemProperty -LiteralPath 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders').'{374DE290-123F-4565-9164-39C4925E467B}'
if ($downloadsDirectory) { $downloadsDirectory = [Environment]::ExpandEnvironmentVariables($downloadsDirectory) }
else { $downloadsDirectory = Join-Path $env:USERPROFILE 'Downloads' }
$config = @{ executable=$downloader; galleryExecutable=$galleryDownloader; ffmpegDirectory=$ffmpegDirectory; outputDirectory=(Join-Path $downloadsDirectory 'Media Extractor\YouTube') }
$config | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $localDirectory 'config.json') -Encoding UTF8
# Windows PowerShell writes a BOM; Node's JSON parser expects plain UTF-8.
$configPath = Join-Path $localDirectory 'config.json'
[System.IO.File]::WriteAllText($configPath, ($config | ConvertTo-Json), [System.Text.UTF8Encoding]::new($false))
& $downloader --version
if ($LASTEXITCODE -ne 0) { throw 'yt-dlp could not start.' }
Write-Host 'Dependencies ready. Continue with Install YouTube Downloader.exe.'
