// Generates the tray icons and app icon (a panther-head silhouette) as PNGs
// with zero image dependencies — raw PNG encoding via zlib.
import { deflateSync } from 'zlib'
import { mkdirSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

// ---- minimal PNG encoder (RGBA, 8-bit) ----
const CRC_TABLE = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()

function crc32(buf) {
  let c = -1
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type RGBA
  const raw = Buffer.alloc(height * (1 + width * 4))
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 4)] = 0 // filter: none
    rgba.copy(raw, y * (1 + width * 4) + 1, y * width * 4, (y + 1) * width * 4)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ])
}

// ---- panther head silhouette: circle + two triangular ears ----
function inTriangle(px, py, [ax, ay], [bx, by], [cx, cy]) {
  const s = (ax - cx) * (py - cy) - (ay - cy) * (px - cx)
  const t = (bx - ax) * (py - ay) - (by - ay) * (px - ax)
  const u = (cx - bx) * (py - by) - (cy - by) * (px - bx)
  return (s >= 0 && t >= 0 && u >= 0) || (s <= 0 && t <= 0 && u <= 0)
}

function drawHead(size, color) {
  const [r, g, b] = color
  const px = Buffer.alloc(size * size * 4)
  const cx = size / 2
  const cy = size * 0.58
  const radius = size * 0.34
  const earL = [
    [size * 0.2, size * 0.42],
    [size * 0.24, size * 0.08],
    [size * 0.46, size * 0.28]
  ]
  const earR = [
    [size * 0.8, size * 0.42],
    [size * 0.76, size * 0.08],
    [size * 0.54, size * 0.28]
  ]
  const ss = 3 // supersampling for smooth edges
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let hits = 0
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const fx = x + (sx + 0.5) / ss
          const fy = y + (sy + 0.5) / ss
          const inCircle = (fx - cx) ** 2 + (fy - cy) ** 2 <= radius ** 2
          if (inCircle || inTriangle(fx, fy, ...earL) || inTriangle(fx, fy, ...earR)) hits++
        }
      }
      const a = Math.round((hits / (ss * ss)) * 255)
      const i = (y * size + x) * 4
      px[i] = r
      px[i + 1] = g
      px[i + 2] = b
      px[i + 3] = a
    }
  }
  return px
}

function write(path, size, color) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, encodePng(size, size, drawHead(size, color)))
  console.log('wrote', path)
}

const black = [10, 10, 12]
write(join(root, 'assets', 'trayTemplate.png'), 16, black) // macOS template (auto light/dark)
write(join(root, 'assets', 'trayTemplate@2x.png'), 32, black)
write(join(root, 'assets', 'tray.png'), 32, [235, 235, 240]) // Windows tray (light on dark taskbar)
write(join(root, 'build', 'icon.png'), 512, black) // app/installer icon
