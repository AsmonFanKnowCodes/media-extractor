param(
  [string]$ExtensionId,
  [string]$Destination = (Join-Path $env:LOCALAPPDATA 'YouTubeVideoDownloader'),
  [ValidatePattern('^[a-z0-9_]+(\.[a-z0-9_]+)+$')][string]$HostName = 'com.personal.youtube_downloader'
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCommand) { throw 'Node.js 22 or later is required for installation. Install it from nodejs.org, then run this installer again.' }
if ([int]((& $nodeCommand.Source --version).TrimStart('v').Split('.')[0]) -lt 22) { throw 'Node.js 22 or later is required.' }
if (-not $ExtensionId) {
  $ExtensionId = (& $nodeCommand.Source (Join-Path $PSScriptRoot 'extension-id.mjs') (Join-Path $projectRoot 'extension')).Trim()
}
if ($ExtensionId -notmatch '^[a-p]{32}$') { throw 'Invalid extension ID.' }
$configPath = Join-Path $PSScriptRoot '.local\config.json'
if (-not (Test-Path -LiteralPath $configPath)) {
  & (Join-Path $PSScriptRoot 'setup.ps1')
}
$oldConfig = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
if (-not (Test-Path -LiteralPath $oldConfig.executable)) { throw 'The downloader is missing. Run Update YouTube Downloader.cmd.' }
$Destination = [System.IO.Path]::GetFullPath($Destination)
$helperDirectory = Join-Path $Destination 'helper'
$binDirectory = Join-Path $Destination 'bin'
$extensionDirectory = Join-Path $Destination 'extension'
New-Item -ItemType Directory -Path $Destination,$helperDirectory,$binDirectory,$extensionDirectory -Force | Out-Null
Copy-Item -LiteralPath $nodeCommand.Source -Destination (Join-Path $Destination 'node.exe') -Force
foreach ($name in @('server.mjs','native.mjs','native-protocol.mjs')) { Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination (Join-Path $helperDirectory $name) -Force }
Copy-Item -LiteralPath (Join-Path $projectRoot 'extension\youtube-url.js') -Destination (Join-Path $extensionDirectory 'youtube-url.js') -Force
Copy-Item -LiteralPath $oldConfig.executable -Destination (Join-Path $binDirectory 'yt-dlp.exe') -Force
foreach ($name in @('ffmpeg.exe','ffprobe.exe')) { Copy-Item -LiteralPath (Join-Path $oldConfig.ffmpegDirectory $name) -Destination (Join-Path $binDirectory $name) -Force }
$config = @{executable=(Join-Path $binDirectory 'yt-dlp.exe');ffmpegDirectory=$binDirectory;outputDirectory=$oldConfig.outputDirectory}
$utf8 = [System.Text.UTF8Encoding]::new($false)
[System.IO.File]::WriteAllText((Join-Path $helperDirectory 'config.json'),($config|ConvertTo-Json),$utf8)
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path -LiteralPath $compiler)) { $compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe' }
& $compiler /nologo /target:winexe ("/out:" + (Join-Path $Destination 'native-host.exe')) (Join-Path $PSScriptRoot 'NativeHost.cs')
if ($LASTEXITCODE -ne 0) { throw 'Could not build the native launcher.' }
$manifestPath = Join-Path $Destination 'native-host.json'
$allowedOrigins = @("chrome-extension://$ExtensionId/")
# Preserve registrations for other copies installed by this same user.
if (Test-Path -LiteralPath $manifestPath) {
 $prior = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
 if ($prior.name -eq $HostName) { $allowedOrigins += @($prior.allowed_origins | Where-Object { $_ -match '^chrome-extension://[a-p]{32}/$' }) }
}
$manifest = @{name=$HostName;description='YouTube Video Downloader';path=(Join-Path $Destination 'native-host.exe');type='stdio';allowed_origins=@($allowedOrigins | Select-Object -Unique)}
[System.IO.File]::WriteAllText($manifestPath,($manifest|ConvertTo-Json -Depth 4),$utf8)
foreach ($browserKey in @('Google\Chrome','Microsoft\Edge')) {
 $registryPath = "HKCU:\Software\$browserKey\NativeMessagingHosts\$HostName"
 New-Item -Path $registryPath -Force | Out-Null
 Set-Item -LiteralPath $registryPath -Value $manifestPath
}
Write-Output "Installed for extension $ExtensionId. Reload the extension, then click Check connection."
