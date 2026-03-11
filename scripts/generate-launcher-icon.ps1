Add-Type -AssemblyName System.Drawing

function New-RoundedRectPath([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $path.AddArc($x, $y, $d, $d, 180, 90)
  $path.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $path.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $path.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $path.CloseFigure()
  return $path
}

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
  if ($outBmp) { $outBmp.Dispose() }
  if ($img) { $img.Dispose() }
}

$sourceDir = 'e:\ello\assets\launcher'
if (!(Test-Path $sourceDir)) {
  New-Item -ItemType Directory -Path $sourceDir | Out-Null
}
$sourcePng = Join-Path $sourceDir 'ello-launcher-1024.png'

# Build source launcher icon (ELLO brand style)
$bmp = New-Object System.Drawing.Bitmap 1024, 1024
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

$bgBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(10, 14, 24))
$g.FillRectangle($bgBrush, 0, 0, 1024, 1024)

$path = New-RoundedRectPath 110 110 804 804 190
$gradRect = New-Object System.Drawing.RectangleF 110, 110, 804, 804
$grad = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
  $gradRect,
  [System.Drawing.Color]::FromArgb(154, 64, 255),
  [System.Drawing.Color]::FromArgb(52, 112, 255),
  25
)
$g.FillPath($grad, $path)

$font = New-Object System.Drawing.Font('Segoe UI', 430, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$sf = New-Object System.Drawing.StringFormat
$sf.Alignment = [System.Drawing.StringAlignment]::Center
$sf.LineAlignment = [System.Drawing.StringAlignment]::Center
$white = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(245, 248, 255))
$g.DrawString('E', $font, $white, [System.Drawing.RectangleF]::new(110, 120, 804, 804), $sf)

$bmp.Save($sourcePng, [System.Drawing.Imaging.ImageFormat]::Png)

$white.Dispose()
$sf.Dispose()
$font.Dispose()
$grad.Dispose()
$path.Dispose()
$bgBrush.Dispose()
if ($g) { $g.Dispose() }
if ($bmp) { $bmp.Dispose() }

# Android target sizes
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
    Resize-And-Save $sourcePng (Join-Path $baseDir 'ic_launcher.png') $densitySizes[$density].icon
    Resize-And-Save $sourcePng (Join-Path $baseDir 'ic_launcher_round.png') $densitySizes[$density].icon
    Resize-And-Save $sourcePng (Join-Path $baseDir 'ic_launcher_foreground.png') $densitySizes[$density].fg
  }
}

# iOS icon target
$iosTargets = @(
  'e:\ello\ello-web\ios\App\App\Assets.xcassets\AppIcon.appiconset\AppIcon-512@2x.png',
  'e:\ello\ios\App\App\Assets.xcassets\AppIcon.appiconset\AppIcon-512@2x.png'
)

foreach ($iosIcon in $iosTargets) {
  Resize-And-Save $sourcePng $iosIcon 1024
}

Write-Output "launcher-icon-generated: $sourcePng"