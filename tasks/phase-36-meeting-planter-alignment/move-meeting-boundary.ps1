Add-Type -AssemblyName System.Drawing

$sourcePath = Join-Path $PSScriptRoot '..\..\src\renderer\src\assets\pixel-office\office-background-v3.png'
$targetPath = Join-Path $PSScriptRoot '..\..\src\renderer\src\assets\pixel-office\office-background-v4.png'
$sourcePath = [System.IO.Path]::GetFullPath($sourcePath)
$targetPath = [System.IO.Path]::GetFullPath($targetPath)

$source = [System.Drawing.Bitmap]::FromFile($sourcePath)
$result = New-Object System.Drawing.Bitmap($source.Width, $source.Height, $source.PixelFormat)
$graphics = [System.Drawing.Graphics]::FromImage($result)
$graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
$graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
$graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
$graphics.DrawImageUnscaled($source, 0, 0)

# Central meeting-room lower glass assembly in the 1536x1024 source asset.
$x = 535
$y = 309
$width = 564
$height = 70
$offsetY = 8
$sourceRect = New-Object System.Drawing.Rectangle($x, $y, $width, $height)
$targetRect = New-Object System.Drawing.Rectangle($x, ($y - $offsetY), $width, $height)
$graphics.DrawImage($source, $targetRect, $sourceRect, [System.Drawing.GraphicsUnit]::Pixel)

# Restore the exposed strip from the mint floor immediately below the old boundary.
$floorRect = New-Object System.Drawing.Rectangle($x, ($y + $height), $width, $offsetY)
$exposedRect = New-Object System.Drawing.Rectangle($x, ($y + $height - $offsetY), $width, $offsetY)
$graphics.DrawImage($source, $exposedRect, $floorRect, [System.Drawing.GraphicsUnit]::Pixel)

$result.Save($targetPath, [System.Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose()
$result.Dispose()
$source.Dispose()

Write-Output $targetPath
