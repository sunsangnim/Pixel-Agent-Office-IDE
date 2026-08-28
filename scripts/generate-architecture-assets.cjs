const fs = require('node:fs')
const path = require('node:path')
const { PNG } = require('pngjs')

const outputDirectory = path.join(process.cwd(), 'src', 'renderer', 'src', 'assets', 'pixel-office', 'architecture')

function image(width, height) { return new PNG({ width, height }) }
function pixel(target, x, y, color) {
  if (x < 0 || y < 0 || x >= target.width || y >= target.height) return
  const offset = (y * target.width + x) * 4
  color.forEach((value, channel) => { target.data[offset + channel] = value })
  target.data[offset + 3] = color[3] ?? 255
}
function rect(target, x, y, width, height, color) {
  for (let py = y; py < y + height; py += 1) for (let px = x; px < x + width; px += 1) pixel(target, px, py, color)
}
function line(target, x, y, length, color, vertical = false) {
  for (let index = 0; index < length; index += 1) pixel(target, x + (vertical ? 0 : index), y + (vertical ? index : 0), color)
}

const palette = {
  ivory: [231, 220, 193], ivoryLight: [247, 240, 218], ivoryShadow: [190, 174, 143],
  teal: [39, 79, 75], tealDark: [24, 54, 52], tealLight: [85, 133, 124],
  walnut: [136, 78, 43], walnutLight: [190, 122, 65],
  glass: [137, 198, 196], glassLight: [205, 239, 227], glassShadow: [83, 145, 146]
}

function horizontalWall() {
  const target = image(64, 16)
  rect(target, 0, 0, 64, 16, palette.ivory)
  line(target, 0, 0, 64, palette.ivoryLight)
  line(target, 0, 2, 64, palette.walnutLight)
  line(target, 0, 3, 64, palette.walnut)
  line(target, 0, 12, 64, palette.tealLight)
  rect(target, 0, 13, 64, 2, palette.teal)
  line(target, 0, 15, 64, palette.tealDark)
  for (let x = 7; x < 64; x += 17) pixel(target, x, 7, palette.ivoryLight)
  return target
}

function verticalWall() {
  const target = image(16, 64)
  rect(target, 0, 0, 16, 64, palette.ivory)
  line(target, 0, 0, 64, palette.ivoryLight, true)
  line(target, 2, 0, 64, palette.walnutLight, true)
  line(target, 3, 0, 64, palette.walnut, true)
  line(target, 12, 0, 64, palette.tealLight, true)
  rect(target, 13, 0, 2, 64, palette.teal)
  line(target, 15, 0, 64, palette.tealDark, true)
  for (let y = 7; y < 64; y += 17) pixel(target, 7, y, palette.ivoryLight)
  return target
}

function wallSurface(width = 64, height = 64) {
  const target = image(width, height)
  rect(target, 0, 0, width, height, palette.ivory)
  rect(target, 0, 0, width, 4, palette.ivoryLight)
  line(target, 0, 5, width, palette.walnutLight)
  line(target, 0, 6, width, palette.walnut)
  rect(target, 0, height - 13, width, 3, palette.tealLight)
  rect(target, 0, height - 10, width, 7, palette.teal)
  rect(target, 0, height - 3, width, 3, palette.tealDark)
  for (let x = 9; x < width; x += 19) {
    pixel(target, x, 21, palette.ivoryLight)
    pixel(target, x + 1, 22, palette.ivoryShadow)
  }
  return target
}

function horizontalGlassWall() {
  const target = image(64, 16)
  rect(target, 0, 0, 64, 16, [111, 190, 187, 150])
  rect(target, 0, 0, 64, 3, palette.tealDark)
  line(target, 0, 3, 64, palette.tealLight)
  line(target, 0, 6, 64, [214, 245, 232, 205])
  line(target, 0, 12, 64, [185, 229, 217, 190])
  rect(target, 0, 13, 64, 3, palette.tealDark)
  for (let x = 11; x < 64; x += 24) {
    pixel(target, x, 8, [225, 250, 238, 220])
    pixel(target, x + 1, 9, [225, 250, 238, 180])
  }
  return target
}

function verticalGlassWall() {
  const target = image(16, 64)
  rect(target, 0, 0, 16, 64, [111, 190, 187, 150])
  rect(target, 0, 0, 3, 64, palette.tealDark)
  line(target, 3, 0, 64, palette.tealLight, true)
  line(target, 6, 0, 64, [214, 245, 232, 205], true)
  line(target, 12, 0, 64, [185, 229, 217, 190], true)
  rect(target, 13, 0, 3, 64, palette.tealDark)
  for (let y = 11; y < 64; y += 24) {
    pixel(target, 8, y, [225, 250, 238, 220])
    pixel(target, 9, y + 1, [225, 250, 238, 180])
  }
  return target
}

function windowPanel(width = 64, height = 64) {
  const target = image(width, height)
  rect(target, 0, 0, width, height, palette.tealDark)
  rect(target, 3, 3, width - 6, height - 9, palette.teal)
  rect(target, 6, 6, width - 12, height - 15, palette.glassShadow)
  rect(target, 8, 8, width - 16, height - 19, palette.glass)
  line(target, 8, 8, width - 16, palette.glassLight)
  line(target, 5, height - 7, width - 10, palette.ivoryLight)
  line(target, 3, height - 5, width - 6, palette.ivoryShadow)
  line(target, 2, height - 3, width - 4, palette.walnutLight)
  line(target, 2, height - 2, width - 4, palette.walnut)
  for (let step = 0; step < Math.min(width, height) / 2; step += 1) {
    if (step % 3 !== 1) pixel(target, 10 + step, 10 + step, palette.glassLight)
    if (step % 4 === 0 && 18 + step < width - 8) pixel(target, 18 + step, 10 + step, palette.glassLight)
  }
  return target
}

function panoramicWindow(width = 64, height = 64) {
  const target = image(width, height)
  // Seamless glass: only continuous ceiling/floor rails, no repeated mullions.
  rect(target, 0, 0, width, height, palette.glassShadow)
  rect(target, 0, 6, width, height - 16, palette.glass)
  rect(target, 0, 0, width, 3, palette.tealDark)
  rect(target, 0, 3, width, 3, palette.teal)
  line(target, 0, 6, width, palette.glassLight)
  line(target, 0, height - 11, width, palette.glassLight)
  rect(target, 0, height - 10, width, 3, palette.ivoryLight)
  rect(target, 0, height - 7, width, 2, palette.ivoryShadow)
  rect(target, 0, height - 5, width, 3, palette.walnutLight)
  rect(target, 0, height - 2, width, 2, palette.walnut)
  // Reflections cross tile edges so adjacent modules read as one glass wall.
  for (let y = 10; y < height - 15; y += 1) {
    for (const offset of [-48, 16, 80]) {
      const x = offset + y
      for (let thickness = 0; thickness < 4; thickness += 1) pixel(target, x + thickness, y, palette.glassLight)
    }
  }
  return target
}

fs.mkdirSync(outputDirectory, { recursive: true })
const outputs = {
  'wall-horizontal-v1.png': horizontalWall(),
  'wall-vertical-v1.png': verticalWall(),
  'wall-surface-v1.png': wallSurface(),
  'glass-wall-horizontal-v1.png': horizontalGlassWall(),
  'glass-wall-vertical-v1.png': verticalGlassWall(),
  'window-wide-v1.png': panoramicWindow(64, 64),
  'window-narrow-v1.png': windowPanel(42, 92)
}
for (const [name, target] of Object.entries(outputs)) {
  fs.writeFileSync(path.join(outputDirectory, name), PNG.sync.write(target))
  console.log(`${name}: ${target.width}x${target.height}`)
}
