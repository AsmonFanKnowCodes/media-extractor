param(
  [string]$ExtensionId,
  [string]$Destination=(Join-Path $env:LOCALAPPDATA 'MediaExtractor'),
  [ValidatePattern('^[a-z0-9_]+(\.[a-z0-9_]+)+$')][string]$HostName='com.personal.youtube_downloader',
  [switch]$IgnoreSystemNode,
  [switch]$RefreshTools
)
$ErrorActionPreference='Stop'
if(-not [Environment]::Is64BitOperatingSystem) {throw 'Media Extractor requires 64-bit Windows.'}
$projectRoot=Split-Path -Parent $PSScriptRoot
$Destination=[IO.Path]::GetFullPath($Destination)
$helperDirectory=Join-Path $Destination 'helper'
$extensionDirectory=Join-Path $Destination 'extension'
$binDirectory=Join-Path $Destination 'bin'
$utf8=[Text.UTF8Encoding]::new($false)
Write-Host 'PROGRESS|5|Checking the installation...'
# Check owned executables before changing an existing installation.
foreach($name in @('node.exe','native-host.exe','folder-picker.exe','bin\yt-dlp.exe','bin\gallery-dl.exe')) {
  $file=Join-Path $Destination $name
  if(Test-Path -LiteralPath $file) {
    try {$handle=[IO.File]::Open($file,[IO.FileMode]::Open,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None);$handle.Dispose()}
    catch {throw 'Media Extractor is still running. Finish downloads, close browsers using it, and click Retry.'}
  }
}
New-Item -ItemType Directory -Path $Destination,$helperDirectory,$extensionDirectory,$binDirectory -Force | Out-Null
. (Join-Path $PSScriptRoot 'runtime.ps1')
$nodePath=Get-MediaNode -CacheDirectory (Join-Path $Destination 'cache\runtime') -IgnoreSystemNode:$IgnoreSystemNode
$sourceConfig=Join-Path $PSScriptRoot '.local\config.json'
$cacheDirectory=Join-Path $Destination 'cache\tools'
$cacheConfig=Join-Path $cacheDirectory '.local\config.json'
$toolsConfig=$null
foreach($candidate in @($sourceConfig,$cacheConfig)) {
  if($RefreshTools) {break}
  if(Test-Path -LiteralPath $candidate) {
    try {$candidateConfig=Get-Content -LiteralPath $candidate -Raw | ConvertFrom-Json}catch{continue}
    if($candidateConfig.executable -and $candidateConfig.galleryExecutable -and $candidateConfig.ffmpegDirectory -and (Test-Path -LiteralPath $candidateConfig.executable) -and (Test-Path -LiteralPath $candidateConfig.galleryExecutable) -and (Test-Path -LiteralPath (Join-Path $candidateConfig.ffmpegDirectory 'ffmpeg.exe')) -and (Test-Path -LiteralPath (Join-Path $candidateConfig.ffmpegDirectory 'ffprobe.exe'))) {$toolsConfig=$candidateConfig;break}
  }
}
if(-not $toolsConfig) {
  Write-Host 'PROGRESS|25|Downloading verified media tools. This may take a few minutes...'
  & (Join-Path $PSScriptRoot 'setup.ps1') -WorkingDirectory $cacheDirectory -NodePath $nodePath
  $toolsConfig=Get-Content -LiteralPath $cacheConfig -Raw | ConvertFrom-Json
}
Write-Host 'PROGRESS|65|Installing the app and browser extension...'
if([IO.Path]::GetFullPath($nodePath) -ne (Join-Path $Destination 'node.exe')) {Copy-Item -LiteralPath $nodePath -Destination (Join-Path $Destination 'node.exe') -Force}
foreach($name in @('server.mjs','native.mjs','native-protocol.mjs','settings.mjs','photos.mjs','browser-session.mjs')) {Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination (Join-Path $helperDirectory $name) -Force}
# A stable installed extension folder means the downloaded ZIP can be removed.
Get-ChildItem -LiteralPath (Join-Path $projectRoot 'extension') -Force | ForEach-Object {Copy-Item -LiteralPath $_.FullName -Destination $extensionDirectory -Recurse -Force}
Copy-Item -LiteralPath $toolsConfig.executable -Destination (Join-Path $binDirectory 'yt-dlp.exe') -Force
Copy-Item -LiteralPath $toolsConfig.galleryExecutable -Destination (Join-Path $binDirectory 'gallery-dl.exe') -Force
foreach($name in @('ffmpeg.exe','ffprobe.exe')) {Copy-Item -LiteralPath (Join-Path $toolsConfig.ffmpegDirectory $name) -Destination (Join-Path $binDirectory $name) -Force}
$saveFolder=$toolsConfig.outputDirectory
$legacyRoot=Join-Path $env:LOCALAPPDATA 'YouTubeVideoDownloader'
$legacyConfig=Join-Path $legacyRoot 'helper\config.json'
$installedConfig=Join-Path $helperDirectory 'config.json'
if($HostName -eq 'com.personal.youtube_downloader' -and (Test-Path -LiteralPath $legacyConfig)) {
  $legacy=Get-Content -LiteralPath $legacyConfig -Raw | ConvertFrom-Json
  if($legacy.outputDirectory) {$saveFolder=$legacy.outputDirectory}
}
if(Test-Path -LiteralPath $installedConfig) {
  $existing=Get-Content -LiteralPath $installedConfig -Raw | ConvertFrom-Json
  if($existing.outputDirectory) {$saveFolder=$existing.outputDirectory}
}
$config=@{executable=(Join-Path $binDirectory 'yt-dlp.exe');galleryExecutable=(Join-Path $binDirectory 'gallery-dl.exe');ffmpegDirectory=$binDirectory;outputDirectory=$saveFolder}
[IO.File]::WriteAllText($installedConfig,($config|ConvertTo-Json),$utf8)
Write-Host 'PROGRESS|80|Registering Chrome, Edge and Brave support...'
$compiler=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if(-not (Test-Path -LiteralPath $compiler)) {$compiler=Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe'}
& $compiler /nologo /target:winexe ("/out:"+(Join-Path $Destination 'native-host.exe')) (Join-Path $PSScriptRoot 'NativeHost.cs')
if($LASTEXITCODE -ne 0) {throw 'Could not build the native launcher.'}
& $compiler /nologo /target:winexe /reference:System.Windows.Forms.dll /reference:System.Drawing.dll ("/out:"+(Join-Path $Destination 'folder-picker.exe')) (Join-Path $PSScriptRoot 'FolderPicker.cs')
if($LASTEXITCODE -ne 0) {throw 'Could not build the folder chooser.'}
$installedId=(& $nodePath (Join-Path $PSScriptRoot 'extension-id.mjs') $extensionDirectory).Trim()
if($installedId -notmatch '^[a-p]{32}$') {throw 'Could not identify the installed extension.'}
if($ExtensionId -and $ExtensionId -notmatch '^[a-p]{32}$') {throw 'Invalid extension ID.'}
$allowedOrigins=@("chrome-extension://$installedId/")
if($ExtensionId) {$allowedOrigins+="chrome-extension://$ExtensionId/"}
$manifestPath=Join-Path $Destination 'native-host.json'
$previousManifests=@($manifestPath)
if($HostName -eq 'com.personal.youtube_downloader') {$previousManifests+=(Join-Path $legacyRoot 'native-host.json')}
foreach($previous in $previousManifests) {
 if(Test-Path -LiteralPath $previous) {
  $prior=Get-Content -LiteralPath $previous -Raw | ConvertFrom-Json
  if($prior.name -eq $HostName) {$allowedOrigins+=@($prior.allowed_origins | Where-Object {$_ -match '^chrome-extension://[a-p]{32}/$'})}
 }
}
$manifest=@{name=$HostName;description='Media Extractor';path=(Join-Path $Destination 'native-host.exe');type='stdio';allowed_origins=@($allowedOrigins|Select-Object -Unique)}
[IO.File]::WriteAllText($manifestPath,($manifest|ConvertTo-Json -Depth 4),$utf8)
foreach($browserKey in @('Google\Chrome','Microsoft\Edge','BraveSoftware\Brave-Browser')) {
 $registryPath="HKCU:\Software\$browserKey\NativeMessagingHosts\$HostName"
 New-Item -Path $registryPath -Force | Out-Null
 Set-Item -LiteralPath $registryPath -Value $manifestPath
}
Write-Host 'PROGRESS|100|Installed. Finish adding the extension in your browser.'
Write-Output "EXTENSION_PATH|$extensionDirectory"
