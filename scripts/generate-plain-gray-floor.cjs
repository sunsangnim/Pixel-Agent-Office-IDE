const fs = require('node:fs')
const path = require('node:path')
const { PNG } = require('pngjs')

const outputPath = path.join(
  process.cwd(),
  'src', 'renderer', 'src', 'assets', 'pixel-office', 'floors', 'plain-gray-floor-v2.png'
)
const tile = new PNG({ width: 64, height: 64 })
const outline = [91, 99, 103, 255]
const highlight = [174, 180, 182, 255]
const shadow = [124, 132, 135, 255]

for (let y = 0; y < tile.height; y += 1) for (let x = 0; x < tile.width; x += 1) {
  const base = 151 - Math.round((y - 2) / 59 * 5)
  let color = [base, base + 6, base + 8, 255]
  if (x === 0 || y === 0 || x === tile.width - 1 || y === tile.height - 1) color = outline
  else if (x === 1 || y === 1) color = highlight
  else if (x === tile.width - 2 || y === tile.height - 2) color = shadow
  const index = (y * tile.width + x) * 4
  tile.data[index] = color[0]
  tile.data[index + 1] = color[1]
  tile.data[index + 2] = color[2]
  tile.data[index + 3] = color[3]
}

fs.writeFileSync(outputPath, PNG.sync.write(tile, { colorType: 2 }))
console.log(`premium plain gray floor v2: ${tile.width}x${tile.height}`)
