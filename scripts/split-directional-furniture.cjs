const fs = require('node:fs')
const path = require('node:path')
const { PNG } = require('pngjs')

const root = process.cwd()
const sourceDirectory = path.join(root, 'src', 'renderer', 'src', 'assets', 'pixel-office', 'archive', 'directional-sources')
const outputDirectory = path.join(root, 'src', 'renderer', 'src', 'assets', 'pixel-office', 'furniture', 'directional')
const assets = [
  'coffee-machine', 'refrigerator', 'pantry-cabinet', 'presentation-screen',
  // Long-table directions are generated independently because splitting a
  // shared sheet clipped its long silhouette across quadrant boundaries.
  'laptop', 'workstation-desk', 'office-chair', 'office-plant',
  'side-table', 'office-sofa', 'floor-lamp', 'bookcase'
]
const directions = ['front', 'right', 'back', 'left']

fs.mkdirSync(outputDirectory, { recursive: true })

function removeConnectedBackdrop(image) {
  const seen = new Uint8Array(image.width * image.height)
  const queue = []
  const isBackdrop = (index) => {
    const offset = index * 4
    if (image.data[offset + 3] === 0) return true
    const r = image.data[offset]
    const g = image.data[offset + 1]
    const b = image.data[offset + 2]
    return Math.min(r, g, b) >= 178 && Math.max(r, g, b) - Math.min(r, g, b) <= 18
  }
  const enqueue = (x, y) => {
    if (x < 0 || y < 0 || x >= image.width || y >= image.height) return
    const index = y * image.width + x
    if (seen[index] || !isBackdrop(index)) return
    seen[index] = 1
    queue.push(index)
  }
  for (let x = 0; x < image.width; x += 1) {
    enqueue(x, 0)
    enqueue(x, image.height - 1)
  }
  for (let y = 0; y < image.height; y += 1) {
    enqueue(0, y)
    enqueue(image.width - 1, y)
  }
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const index = queue[cursor]
    image.data[index * 4 + 3] = 0
    const x = index % image.width
    const y = Math.floor(index / image.width)
    enqueue(x - 1, y)
    enqueue(x + 1, y)
    enqueue(x, y - 1)
    enqueue(x, y + 1)
  }
}

function extractQuadrant(source, column, row) {
  const width = Math.floor(source.width / 2)
  const height = Math.floor(source.height / 2)
  const quadrant = new PNG({ width, height })
  PNG.bitblt(source, quadrant, column * width, row * height, width, height, 0, 0)
  removeConnectedBackdrop(quadrant)

  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    if (quadrant.data[(y * width + x) * 4 + 3] < 8) continue
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }
  if (maxX < minX || maxY < minY) return quadrant
  const contentWidth = maxX - minX + 1
  const contentHeight = maxY - minY + 1
  const padding = Math.max(8, Math.ceil(Math.max(contentWidth, contentHeight) * 0.06))
  const output = new PNG({ width: contentWidth + padding * 2, height: contentHeight + padding * 2 })
  PNG.bitblt(quadrant, output, minX, minY, contentWidth, contentHeight, padding, padding)
  return output
}

for (const asset of assets) {
  const source = PNG.sync.read(fs.readFileSync(path.join(sourceDirectory, `${asset}-sheet.png`)))
  directions.forEach((direction, index) => {
    const output = extractQuadrant(source, index % 2, Math.floor(index / 2))
    fs.writeFileSync(path.join(outputDirectory, `${asset}-${direction}-v1.png`), PNG.sync.write(output))
  })
  console.log(`${asset}: ${source.width}x${source.height} -> four directional assets`)
}
