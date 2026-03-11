param(
  [Parameter(Mandatory = $true)]
  [string]$SourceIconPath
)

Add-Type -AssemblyName System.Drawing

function Resize-And-Save([string]$src, [string]$dst, [int]$size) {
  $img = [System.Drawing.Image]::FromFile($src)
  $outBmp = New-Object System.Drawing.Bitmap $size, $size
  $gfx = [System.Drawing.Graphics]::FromImage($outBmp)
  $gfx.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $gfx.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $gfx.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $gfx.DrawImage($img, 0, 0, $size, $size)

  $dir = Split-Path $dst -Parent
  if (!(Test-Path $dir)) {
    New-Item -ItemType Directory -Path $dir | Out-Null
  }

  $outBmp.Save($dst, [System.Drawing.Imaging.ImageFormat]::Png)
  $gfx.Dispose()
  $outBmp.Dispose()
  $img.Dispose()
}

if (!(Test-Path $SourceIconPath)) {
  throw "Source icon not found: $SourceIconPath"
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$launcherDir = Join-Path $repoRoot 'assets\launcher'
if (!(Test-Path $launcherDir)) {
  New-Item -ItemType Directory -Path $launcherDir | Out-Null
}
$canonicalSource = Join-Path $launcherDir 'ello-launcher-1024.png'
Copy-Item -LiteralPath $SourceIconPath -Destination $canonicalSource -Force

$androidRoots = @(
  (Join-Path $repoRoot 'ello-web\android'),
  (Join-Path $repoRoot 'android')
) | Where-Object { Test-Path $_ }
$densitySizes = @{
  'mdpi' = @{ icon = 48; fg = 108 }
  'hdpi' = @{ icon = 72; fg = 162 }
  'xhdpi' = @{ icon = 96; fg = 216 }
  'xxhdpi' = @{ icon = 144; fg = 324 }
  'xxxhdpi' = @{ icon = 192; fg = 432 }
}

foreach ($root in $androidRoots) {
  foreach ($density in $densitySizes.Keys) {
    $baseDir = Join-Path $root ("app\\src\\main\\res\\mipmap-$density")
    Resize-And-Save $canonicalSource (Join-Path $baseDir 'ic_launcher.png') $densitySizes[$density].icon
    Resize-And-Save $canonicalSource (Join-Path $baseDir 'ic_launcher_round.png') $densitySizes[$density].icon
    Resize-And-Save $canonicalSource (Join-Path $baseDir 'ic_launcher_foreground.png') $densitySizes[$density].fg
  }
}

$iosTargets = @()
$webIosIcon = Join-Path $repoRoot 'ello-web\ios\App\App\Assets.xcassets\AppIcon.appiconset\AppIcon-512@2x.png'
$rootIosIcon = Join-Path $repoRoot 'ios\App\App\Assets.xcassets\AppIcon.appiconset\AppIcon-512@2x.png'
if (Test-Path (Split-Path $webIosIcon -Parent)) { $iosTargets += $webIosIcon }
if (Test-Path (Split-Path $rootIosIcon -Parent)) { $iosTargets += $rootIosIcon }

foreach ($iosIcon in $iosTargets) {
  Resize-And-Save $canonicalSource $iosIcon 1024
}

Write-Output "launcher-icon-applied: $canonicalSource"
