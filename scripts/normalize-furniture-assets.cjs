const fs = require('node:fs')
const path = require('node:path')
const { PNG } = require('pngjs')

const directory = path.join(process.cwd(), 'src', 'renderer', 'src', 'assets', 'pixel-office', 'furniture')

for (const name of fs.readdirSync(directory).filter((file) => file.endsWith('.png'))) {
  const file = path.join(directory, name)
  const source = PNG.sync.read(fs.readFileSync(file))
  let minX = source.width
  let minY = source.height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < source.height; y += 1) for (let x = 0; x < source.width; x += 1) {
    if (source.data[(y * source.width + x) * 4 + 3] < 8) continue
    minX = Math.min(minX, x); minY = Math.min(minY, y)
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y)
  }
  if (maxX < minX || maxY < minY) throw new Error(`${name}: no opaque pixels`)
  const contentWidth = maxX - minX + 1
  const contentHeight = maxY - minY + 1
  const padding = Math.max(8, Math.ceil(Math.max(contentWidth, contentHeight) * 0.06))
  const output = new PNG({ width: contentWidth + padding * 2, height: contentHeight + padding * 2 })
  PNG.bitblt(source, output, minX, minY, contentWidth, contentHeight, padding, padding)
  fs.writeFileSync(file, PNG.sync.write(output))
  console.log(`${name}: ${source.width}x${source.height} -> ${output.width}x${output.height}`)
}
