const fs = require('node:fs')
const path = require('node:path')
const { PNG } = require('pngjs')

const directory = path.join(process.cwd(), 'src', 'renderer', 'src', 'assets', 'pixel-office', 'floors')
for (const name of fs.readdirSync(directory).filter((file) => file.endsWith('.png'))) {
  const source = PNG.sync.read(fs.readFileSync(path.join(directory, name)))
  if (source.width === 64 && source.height === 64) {
    console.log(`${name}: already normalized`)
    continue
  }
  const output = new PNG({ width: 64, height: 64 })
  const cropSize = Math.floor(Math.min(source.width, source.height) * 0.55)
  const startX = Math.floor((source.width - cropSize) / 2)
  const startY = Math.floor((source.height - cropSize) / 2)
  for (let y = 0; y < 64; y += 1) for (let x = 0; x < 64; x += 1) {
    const mirrorX = Math.min(x, 63 - x)
    const mirrorY = Math.min(y, 63 - y)
    const sx = startX + Math.floor(mirrorX / 31 * (cropSize - 1))
    const sy = startY + Math.floor(mirrorY / 31 * (cropSize - 1))
    const sourceIndex = (sy * source.width + sx) * 4
    const targetIndex = (y * 64 + x) * 4
    source.data.copy(output.data, targetIndex, sourceIndex, sourceIndex + 4)
    output.data[targetIndex + 3] = 255
  }
  fs.writeFileSync(path.join(directory, name), PNG.sync.write(output, { colorType: 2 }))
  console.log(`${name}: ${source.width}x${source.height} -> seamless 64x64`)
}
