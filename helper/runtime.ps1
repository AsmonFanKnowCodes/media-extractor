function Get-MediaNode {
  param([Parameter(Mandatory=$true)][string]$CacheDirectory,[switch]$IgnoreSystemNode)
  $ErrorActionPreference='Stop'
  if(-not $IgnoreSystemNode) {
    $command=Get-Command node -ErrorAction SilentlyContinue
    if($command) {
      $version=& $command.Source --version
      if($LASTEXITCODE -eq 0 -and $version -match '^v(\d+)\.' -and [int]$Matches[1] -ge 22) { return $command.Source }
    }
  }
  $nodePath=Join-Path $CacheDirectory 'node.exe'
  if(Test-Path -LiteralPath $nodePath) {
    $version=& $nodePath --version
    if($LASTEXITCODE -eq 0 -and $version -match '^v(\d+)\.' -and [int]$Matches[1] -ge 22) { return $nodePath }
  }
  New-Item -ItemType Directory -Path $CacheDirectory -Force | Out-Null
  Write-Host 'PROGRESS|15|Downloading a private Node.js runtime...'
  $releases=Invoke-RestMethod -Uri 'https://nodejs.org/dist/index.json'
  $release=$releases | Where-Object { $_.lts -and $_.version -match '^v(2[2-9]|[3-9][0-9])\.' -and $_.files -contains 'win-x64-exe' } | Select-Object -First 1
  if(-not $release -or $release.version -notmatch '^v\d+\.\d+\.\d+$') {throw 'Could not find a supported Node.js LTS release.'}
  $baseUrl="https://nodejs.org/dist/$($release.version)"
  $checksums=(Invoke-WebRequest -Uri "$baseUrl/SHASUMS256.txt" -UseBasicParsing).Content
  $match=[regex]::Match($checksums,'(?m)^([a-fA-F0-9]{64})\s+win-x64/node\.exe\r?$')
  if(-not $match.Success) {throw 'Node.js release checksum was not found.'}
  $partial="$nodePath.partial"
  Invoke-WebRequest -Uri "$baseUrl/win-x64/node.exe" -OutFile $partial -UseBasicParsing
  if((Get-FileHash -LiteralPath $partial -Algorithm SHA256).Hash -ne $match.Groups[1].Value) {throw 'Node.js checksum mismatch. Setup stopped.'}
  Move-Item -LiteralPath $partial -Destination $nodePath -Force
  return $nodePath
}
