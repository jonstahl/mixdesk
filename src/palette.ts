// Pull one usable accent colour out of a cover image. Covers come through the
// Vite proxy, so they're same-origin and the canvas isn't tainted.

const cache = new Map<string, string | null>()

export async function accentFromCover(url: string): Promise<string | null> {
  if (!url) return null
  if (cache.has(url)) return cache.get(url)!
  const img = new Image()
  img.src = url.replace(/cover_\d+x\d+/, 'cover_64x64')
  try {
    await img.decode()
  } catch {
    cache.set(url, null)
    return null
  }
  const size = 32
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(img, 0, 0, size, size)
  const data = ctx.getImageData(0, 0, size, size).data

  // Bucket hues and score each by how vivid and how common it is, so a small
  // red title on a grey sleeve doesn't win over a cover that's mostly teal.
  const buckets = new Map<number, { score: number; r: number; g: number; b: number; n: number }>()
  for (let i = 0; i < data.length; i += 4) {
    const [h, s, l] = rgbToHsl(data[i], data[i + 1], data[i + 2])
    if (l < 0.12 || l > 0.92 || s < 0.18) continue
    const key = Math.round(h * 24)
    const b = buckets.get(key) ?? { score: 0, r: 0, g: 0, b: 0, n: 0 }
    b.score += s * (1 - Math.abs(l - 0.5))
    b.r += data[i]
    b.g += data[i + 1]
    b.b += data[i + 2]
    b.n++
    buckets.set(key, b)
  }
  let best: { score: number; r: number; g: number; b: number; n: number } | null = null
  for (const b of buckets.values()) if (!best || b.score > best.score) best = b
  if (!best || best.n < 6) {
    cache.set(url, null)
    return null
  }
  let [h, s, l] = rgbToHsl(best.r / best.n, best.g / best.n, best.b / best.n)
  // Keep it readable as text and as a fill on the dark slate background.
  s = Math.max(0.42, Math.min(s, 0.85))
  l = Math.max(0.6, Math.min(l, 0.74))
  const colour = `hsl(${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%)`
  cache.set(url, colour)
  return colour
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h =
    max === r ? ((g - b) / d + (g < b ? 6 : 0)) / 6 : max === g ? ((b - r) / d + 2) / 6 : ((r - g) / d + 4) / 6
  return [h, s, l]
}
