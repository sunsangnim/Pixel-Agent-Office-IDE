const fs = require('node:fs')
const path = require('node:path')
const { PNG } = require('pngjs')

const root = process.cwd()
const outputDirectory = path.join(root, 'src', 'renderer', 'src', 'assets', 'pixel-office', 'furniture')
const directionalDirectory = path.join(outputDirectory, 'directional')

function create(width, height) {
  return new PNG({ width, height })
}

function pixel(image, x, y, color) {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) return
  const offset = (y * image.width + x) * 4
  image.data[offset] = color[0]
  image.data[offset + 1] = color[1]
  image.data[offset + 2] = color[2]
  image.data[offset + 3] = color[3] ?? 255
}

function rect(image, x, y, width, height, color) {
  for (let py = y; py < y + height; py += 1) {
    for (let px = x; px < x + width; px += 1) pixel(image, px, py, color)
  }
}

function horizontalTable(back = false) {
  const image = create(256, 96)
  const outline = [47, 38, 35]
  const woodDark = [146, 80, 38]
  const wood = back ? [197, 128, 65] : [215, 145, 72]
  const woodLight = [239, 181, 101]
  const metal = [49, 57, 64]
  const metalLight = [75, 85, 93]
  const runner = [137, 190, 172]
  const runnerLight = [199, 229, 211]

  // Two complete supports remain safely inside the transparent canvas.
  rect(image, 28, 54, 12, 31, outline)
  rect(image, 31, 55, 7, 27, metal)
  rect(image, 33, 56, 3, 23, metalLight)
  rect(image, 216, 54, 12, 31, outline)
  rect(image, 218, 55, 7, 27, metal)
  rect(image, 220, 56, 3, 23, metalLight)
  rect(image, 22, 35, 212, 23, outline)
  rect(image, 25, 38, 206, 17, woodDark)
  rect(image, 28, 28, 200, 25, wood)
  rect(image, 31, 30, 194, 4, woodLight)
  rect(image, 31, 38, 194, 7, runner)
  rect(image, 31, 38, 194, 2, runnerLight)
  rect(image, 31, 45, 194, 2, runnerLight)
  rect(image, 28, 50, 200, 3, woodDark)
  return image
}

function verticalTable(left = false) {
  const image = create(96, 256)
  const outline = [47, 38, 35]
  const woodDark = [146, 80, 38]
  const wood = left ? [201, 132, 66] : [215, 145, 72]
  const woodLight = [239, 181, 101]
  const metal = [49, 57, 64]
  const metalLight = [75, 85, 93]
  const runner = [137, 190, 172]
  const runnerLight = [199, 229, 211]

  // Side views use a genuinely vertical tabletop and four visible support feet.
  rect(image, 12, 22, 72, 212, outline)
  rect(image, 15, 25, 66, 206, woodDark)
  rect(image, 21, 28, 54, 200, wood)
  rect(image, 23, 31, 4, 194, woodLight)
  rect(image, 39, 31, 18, 194, runner)
  rect(image, 39, 31, 2, 194, runnerLight)
  rect(image, 55, 31, 2, 194, runnerLight)
  rect(image, 69, 31, 4, 194, woodDark)
  for (const y of [35, 209]) {
    rect(image, 8, y, 12, 13, outline)
    rect(image, 11, y + 2, 8, 9, metal)
    rect(image, 13, y + 3, 4, 6, metalLight)
    rect(image, 76, y, 12, 13, outline)
    rect(image, 77, y + 2, 8, 9, metal)
    rect(image, 79, y + 3, 4, 6, metalLight)
  }
  return image
}

fs.mkdirSync(directionalDirectory, { recursive: true })
const assets = {
  'long-table-v1.png': horizontalTable(false),
  'directional/long-table-front-v1.png': horizontalTable(false),
  'directional/long-table-right-v1.png': verticalTable(false),
  'directional/long-table-back-v1.png': horizontalTable(true),
  'directional/long-table-left-v1.png': verticalTable(true)
}

for (const [relativePath, image] of Object.entries(assets)) {
  fs.writeFileSync(path.join(outputDirectory, relativePath), PNG.sync.write(image))
  console.log(`${relativePath}: ${image.width}x${image.height}`)
}
