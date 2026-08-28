const fs = require('node:fs')
const { PNG } = require('pngjs')

const [inputPath, outputPath = inputPath] = process.argv.slice(2)
if (!inputPath) throw new Error('usage: node scripts/clean-atlas-background.cjs <input> [output]')

const png = PNG.sync.read(fs.readFileSync(inputPath))
const { width, height, data } = png
const key = (x, y) => (y * width + x) * 4
const sample = (x, y) => {
  const i = key(x, y)
  return [data[i], data[i + 1], data[i + 2]]
}
const palette = []
for (let x = 0; x < width; x += Math.max(1, Math.floor(width / 64))) palette.push(sample(x, 0), sample(x, height - 1))
for (let y = 0; y < height; y += Math.max(1, Math.floor(height / 64))) palette.push(sample(0, y), sample(width - 1, y))
const isBackground = (i) => palette.some(([r, g, b]) =>
  Math.abs(data[i] - r) <= 5 && Math.abs(data[i + 1] - g) <= 5 && Math.abs(data[i + 2] - b) <= 5)

const seen = new Uint8Array(width * height)
const queue = []
const enqueue = (x, y) => {
  if (x < 0 || y < 0 || x >= width || y >= height) return
  const p = y * width + x
  if (seen[p] || !isBackground(p * 4)) return
  seen[p] = 1
  queue.push(p)
}
for (let x = 0; x < width; x += 1) { enqueue(x, 0); enqueue(x, height - 1) }
for (let y = 0; y < height; y += 1) { enqueue(0, y); enqueue(width - 1, y) }
for (let cursor = 0; cursor < queue.length; cursor += 1) {
  const p = queue[cursor]
  const x = p % width
  const y = Math.floor(p / width)
  data[p * 4 + 3] = 0
  enqueue(x - 1, y); enqueue(x + 1, y); enqueue(x, y - 1); enqueue(x, y + 1)
}
fs.writeFileSync(outputPath, PNG.sync.write(png))
console.log(`transparent pixels: ${queue.length}/${width * height}`)
