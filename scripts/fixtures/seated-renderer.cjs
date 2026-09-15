const fs = require('node:fs')
const path = require('node:path')
const { PNG } = require('pngjs')

// A nearest-neighbor RGBA canvas for inspecting normalized original poses in
// Node. Contact points use the same atlas normalization as the real scene.
function rasterCanvas(width, height) {
  const pixels = { width, height, data: new Uint8ClampedArray(width * height * 4) }
  let flipped = false
  const context = {
    clearRect() { pixels.data.fill(0) }, save() {}, restore() { flipped = false },
    translate() {}, scale(x) { flipped = x < 0 },
    drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh) {
      for (let y = dy; y < dy + dh; y++) for (let x = dx; x < dx + dw; x++) {
        const source = (Math.floor(sy + (y - dy + 0.5) / dh * sh) * image.width +
          Math.floor(sx + (x - dx + 0.5) / dw * sw)) * 4
        const target = (y * width + (flipped ? width - 1 - x : x)) * 4
        pixels.data.set(image.data.subarray(source, source + 4), target)
      }
    },
    getImageData() { return { width, height, data: new Uint8ClampedArray(pixels.data) } },
    putImageData(image) { pixels.data.set(image.data) }
  }
  return { pixels, getContext: () => context }
}

function createSeatedRenderer({ measureSeatedSheet, measureCharacterSheet, seatedFrameAnchor }) {
  const root = path.join(process.cwd(), 'src/renderer/src/assets/pixel-office')
  const images = new Map()
  const frames = new Map()
  const read = (file) => {
    if (!images.has(file)) images.set(file, PNG.sync.read(fs.readFileSync(path.join(root, file))))
    return images.get(file)
  }
  function characterFrame(key, name) {
    const cacheKey = key + '/' + name
    if (!frames.has(cacheKey)) {
      const ceo = key.startsWith('ceo-')
      const match = /actor-(\d)-(\d)-sit-(\w+)/.exec(name)
      const image = read(ceo ? 'characters/ceo-seated-v1.png' : `characters/seated-v1/staff-${match[1]}-seated-v1.png`)
      const measured = ceo ? measureCharacterSheet(image.data, image.width, 'ceo-seated-sheet')
        : measureSeatedSheet(image.data, image.width, image.height)
      const index = ceo ? ['front', 'left', 'back', 'right'].indexOf(name.slice(8))
        : ['front', 'back', 'left'].indexOf(match[3]) * 5 + Number(match[2])
      const { source: s, destination: d } = measured[index]
      const canvas = rasterCanvas(312, 360)
      canvas.getContext().drawImage(image, s.x, s.y, s.width, s.height, d.x, d.y, d.width, d.height)
      const column = ceo ? index % 2 : Number(match[2])
      const row = ceo ? Math.floor(index / 2) : Math.floor(index / 5)
      const seatAnchor = seatedFrameAnchor(ceo ? 'ceo-seated-sheet' : `staff-seated-${match[1]}`, column, row, s, d)
      frames.set(cacheKey, { name, source: { image: canvas.pixels }, cutX: 0, cutY: 0, cutWidth: 312, cutHeight: 360, seatAnchor })
    }
    return frames.get(cacheKey)
  }
  function furniturePixels(image) {
    const key = image.texture.key
    return read(key.startsWith('furniture-directional-')
      ? `furniture/directional/${key.slice(22)}-v1.png` : 'furniture/office-chair-v2.png')
  }
  function install(scene) {
    scene.furnitureTexturePixels = furniturePixels
    scene.seatedFrameAnchor = (sprite) => characterFrame(sprite.texture.key, sprite.frame).seatAnchor
    const render = scene.renderSeatedForeground
    scene.renderSeatedForeground = (sprite, ...rest) => render.call(scene,
      { ...sprite, frame: characterFrame(sprite.texture.key, sprite.frame) }, ...rest)
  }
  return { install, characterFrame, furniturePixels }
}

module.exports = { createSeatedRenderer }
