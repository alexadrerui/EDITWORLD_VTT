// Client-side placeholder palette extraction for ImportStudio.tsx — no AI,
// no network request. Downsamples the reference photo onto an offscreen
// canvas and clusters its pixels into a small palette via a lightweight
// k-means. This stands in for real image-to-3D reconstruction (see
// img2threejs_skill_assessment project memory: that pipeline needs an agent
// running outside the browser) until a real generation backend exists.

const SAMPLE_SIZE = 48 // downsample target — plenty for a stable palette, cheap to cluster
const KMEANS_ITERATIONS = 8
const FALLBACK_COLOR = '#8a8f98'

interface Rgb {
  r: number
  g: number
  b: number
}

function toHex({ r, g, b }: Rgb): string {
  const c = (n: number) =>
    Math.round(Math.min(255, Math.max(0, n)))
      .toString(16)
      .padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`
}

// Deterministic — same photo always produces the same palette (seeded from
// evenly spaced samples rather than random picks).
export async function extractPalette(file: File, count: number): Promise<string[]> {
  const bitmap = await createImageBitmap(file)
  const canvas = document.createElement('canvas')
  canvas.width = SAMPLE_SIZE
  canvas.height = SAMPLE_SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) return Array(count).fill(FALLBACK_COLOR)

  ctx.drawImage(bitmap, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE)
  bitmap.close()
  const { data } = ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE)

  const pixels: Rgb[] = []
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 16) continue // skip near-transparent
    pixels.push({ r: data[i], g: data[i + 1], b: data[i + 2] })
  }
  if (pixels.length === 0) return Array(count).fill(FALLBACK_COLOR)

  const centroids: Rgb[] = Array.from({ length: count }, (_, i) => ({
    ...pixels[Math.floor((i / count) * pixels.length)],
  }))

  for (let iter = 0; iter < KMEANS_ITERATIONS; iter++) {
    const sums = centroids.map(() => ({ r: 0, g: 0, b: 0, n: 0 }))
    for (const p of pixels) {
      let best = 0
      let bestDist = Infinity
      for (let c = 0; c < centroids.length; c++) {
        const dr = p.r - centroids[c].r
        const dg = p.g - centroids[c].g
        const db = p.b - centroids[c].b
        const dist = dr * dr + dg * dg + db * db
        if (dist < bestDist) {
          bestDist = dist
          best = c
        }
      }
      sums[best].r += p.r
      sums[best].g += p.g
      sums[best].b += p.b
      sums[best].n++
    }
    for (let c = 0; c < centroids.length; c++) {
      if (sums[c].n === 0) continue
      centroids[c] = { r: sums[c].r / sums[c].n, g: sums[c].g / sums[c].n, b: sums[c].b / sums[c].n }
    }
  }

  // Brightest first — becomes the "body" part's color, darker ones read as
  // roof/accent. Purely cosmetic ordering, no semantic meaning.
  centroids.sort((a, b) => b.r + b.g + b.b - (a.r + a.g + a.b))
  return centroids.map(toHex)
}
