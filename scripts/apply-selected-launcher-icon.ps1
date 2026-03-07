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

$canonicalSource = 'e:\ello\assets\launcher\ello-launcher-1024.png'
Copy-Item -LiteralPath $SourceIconPath -Destination $canonicalSource -Force

$androidRoots = @('e:\ello\ello-web\android', 'e:\ello\android')
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

$iosTargets = @(
  'e:\ello\ello-web\ios\App\App\Assets.xcassets\AppIcon.appiconset\AppIcon-512@2x.png',
  'e:\ello\ios\App\App\Assets.xcassets\AppIcon.appiconset\AppIcon-512@2x.png'
)

foreach ($iosIcon in $iosTargets) {
  Resize-And-Save $canonicalSource $iosIcon 1024
}

Write-Output "launcher-icon-applied: $canonicalSource"
