$ErrorActionPreference='Stop'
$projectRoot=Split-Path -Parent $PSScriptRoot
$buildDirectory=Join-Path $PSScriptRoot '.local\build'
New-Item -ItemType Directory -Path $buildDirectory -Force | Out-Null
$payload=Join-Path $buildDirectory 'payload.zip'
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression
$payloadStream=[IO.File]::Open($payload,[IO.FileMode]::Create,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
$archive=[IO.Compression.ZipArchive]::new($payloadStream,[IO.Compression.ZipArchiveMode]::Create,$false)
try {
  foreach($file in (Get-ChildItem -LiteralPath (Join-Path $projectRoot 'extension') -File -Recurse)) {
    $relative=$file.FullName.Substring($projectRoot.Length+1).Replace('\','/')
    [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive,$file.FullName,$relative)|Out-Null
  }
  foreach($file in (Get-ChildItem -LiteralPath $PSScriptRoot -File | Where-Object {$_.Extension -in @('.mjs','.ps1','.cs')})) {
    [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive,$file.FullName,('helper/'+$file.Name))|Out-Null
  }
} finally {$archive.Dispose()}
$compiler=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if(-not (Test-Path -LiteralPath $compiler)) {$compiler=Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe'}
$output=Join-Path $projectRoot 'MediaExtractor-Setup.exe'
$version=(Get-Content -LiteralPath (Join-Path $projectRoot 'extension\manifest.json') -Raw | ConvertFrom-Json).version
if($version -notmatch '^\d+\.\d+\.\d+$') {throw 'Invalid installer version.'}
$assemblyInfo=Join-Path $buildDirectory 'AssemblyInfo.cs'
[IO.File]::WriteAllText($assemblyInfo,('[assembly: System.Reflection.AssemblyTitle("Media Extractor Setup")]'+"`n"+'[assembly: System.Reflection.AssemblyProduct("Media Extractor")]'+"`n"+'[assembly: System.Reflection.AssemblyVersion("'+$version+'.0")]'+"`n"+'[assembly: System.Reflection.AssemblyFileVersion("'+$version+'.0")]'))
& $compiler /nologo /target:winexe /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.IO.Compression.FileSystem.dll /reference:System.IO.Compression.dll ("/resource:$payload,MediaExtractor.Payload.zip") ("/out:$output") (Join-Path $PSScriptRoot 'Installer.cs') $assemblyInfo
if($LASTEXITCODE -ne 0) {throw 'Installer build failed.'}
Write-Output $output
