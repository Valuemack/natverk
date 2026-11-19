# Sparar nycklar för automatiseringen i natverk\.env (som aldrig checkas in i git).
# Inmatningen visas inte på skärmen och nycklarna skickas aldrig till chatten.
# Kör från mappen natverk:  powershell -ExecutionPolicy Bypass -File scripts\spara-nycklar.ps1
# Tryck bara Enter för att hoppa över en nyckel och behålla det som redan är sparat.

$envFil = Join-Path (Split-Path $PSScriptRoot -Parent) ".env"
$varden = [ordered]@{}
if (Test-Path $envFil) {
  foreach ($rad in Get-Content $envFil) {
    if ($rad -match '^\s*([A-Z_]+)=(.*)$') { $varden[$Matches[1]] = $Matches[2] }
  }
}

function Las-Hemligt($fraga) {
  $s = Read-Host -AsSecureString $fraga
  $b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b) }
}

$fragor = [ordered]@{
  CLOUDFLARE_API_TOKEN  = "Cloudflare API-token"
  CLOUDFLARE_ACCOUNT_ID = "Cloudflare Account ID"
  LOOPIA_API_USER       = "Loopia API-användarnamn (slutar på @loopiaapi)"
  LOOPIA_API_PASSWORD   = "Loopia API-lösenord"
}
foreach ($k in $fragor.Keys) {
  $v = Las-Hemligt $fragor[$k]
  if ($v) { $varden[$k] = $v.Trim() }
}
if (-not $varden.Contains("INDEXNOW_KEY")) {
  $varden["INDEXNOW_KEY"] = -join ((48..57) + (97..122) | Get-Random -Count 32 | ForEach-Object { [char]$_ })
}

$rader = foreach ($k in $varden.Keys) { "$k=$($varden[$k])" }
[IO.File]::WriteAllLines($envFil, [string[]]$rader, (New-Object Text.UTF8Encoding($false)))
Write-Host ""
Write-Host "Sparat i ${envFil}:" -ForegroundColor Green
foreach ($k in $varden.Keys) { Write-Host ("  {0}: {1}" -f $k, $(if ($varden[$k]) { "ifylld" } else { "tom" })) }
