param([Parameter(Mandatory = $true)][string]$ConfigRoot)
$ErrorActionPreference = 'Stop'
$configDirectory = (Resolve-Path -LiteralPath $ConfigRoot).Path
if (-not (Test-Path -LiteralPath (Join-Path $configDirectory '.env') -PathType Leaf)) {
  throw 'ConfigRoot debe apuntar al proyecto con la configuracion existente del servidor.'
}
$projectDirectory = Split-Path -Parent $PSScriptRoot
if (Test-Path -LiteralPath (Join-Path $projectDirectory '.env')) {
  throw 'Este launcher requiere la copia local sin .env; no se reemplazara ningun archivo.'
}
Add-Type -AssemblyName System.Security
$keyDirectory = Join-Path $env:LOCALAPPDATA 'Xplora\local-member-access'
$keyPath = Join-Path $keyDirectory 'member-session-key.dpapi'
$scope = [System.Security.Cryptography.DataProtectionScope]::CurrentUser
if (-not (Test-Path -LiteralPath $keyPath)) {
  [void][System.IO.Directory]::CreateDirectory($keyDirectory)
  $keyBytes = New-Object byte[] 48
  $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try { $generator.GetBytes($keyBytes) } finally { $generator.Dispose() }
  $protectedKey = [System.Security.Cryptography.ProtectedData]::Protect($keyBytes, $null, $scope)
  $keyFile = [System.IO.File]::Open($keyPath, [System.IO.FileMode]::CreateNew)
  try { $keyFile.Write($protectedKey, 0, $protectedKey.Length) } finally { $keyFile.Dispose() }
  [Array]::Clear($keyBytes, 0, $keyBytes.Length)
}
$localKey = [System.Security.Cryptography.ProtectedData]::Unprotect([System.IO.File]::ReadAllBytes($keyPath), $null, $scope)
$env:XPLORA_LOCAL_MEMBER_SECRET = [Convert]::ToBase64String($localKey)
[Array]::Clear($localKey, 0, $localKey.Length)
$env:XPLORA_CONFIG_ROOT = $configDirectory
Push-Location -LiteralPath $projectDirectory
try {
  & node --import tsx server/src/local-member-dev.ts
} finally {
  Remove-Item Env:XPLORA_LOCAL_MEMBER_SECRET -ErrorAction SilentlyContinue
  Remove-Item Env:XPLORA_CONFIG_ROOT -ErrorAction SilentlyContinue
  Pop-Location
}
