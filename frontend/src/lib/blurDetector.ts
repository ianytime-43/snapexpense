/**
 * Blur detection using Laplacian variance.
 * Higher variance = sharper image. Normalized to 0-1 range.
 */

const SHARP_THRESHOLD = 0.25

function toGrayscale(imageData: ImageData): Float32Array {
  const { data, width, height } = imageData
  const gray = new Float32Array(width * height)
  for (let i = 0; i < gray.length; i++) {
    const idx = i * 4
    gray[i] = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]
  }
  return gray
}

function laplacianVariance(gray: Float32Array, width: number, height: number): number {
  const laplacian: number[] = []
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x
      const val =
        gray[idx - width] +
        gray[idx - 1] +
        -4 * gray[idx] +
        gray[idx + 1] +
        gray[idx + width]
      laplacian.push(val)
    }
  }
  if (laplacian.length === 0) return 0
  const mean = laplacian.reduce((s, v) => s + v, 0) / laplacian.length
  const variance = laplacian.reduce((s, v) => s + (v - mean) ** 2, 0) / laplacian.length
  return variance
}

export function calculateBlurScore(imageData: ImageData): number {
  const gray = toGrayscale(imageData)
  const variance = laplacianVariance(gray, imageData.width, imageData.height)
  const normalized = 1 / (1 + Math.exp(-0.01 * (variance - 500)))
  return Math.max(0, Math.min(1, normalized))
}

export function isSharp(imageData: ImageData, threshold = SHARP_THRESHOLD): boolean {
  return calculateBlurScore(imageData) >= threshold
}
