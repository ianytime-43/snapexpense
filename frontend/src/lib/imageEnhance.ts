/**
 * Client-side image enhancement for receipt photos.
 * Runs before upload to improve OCR accuracy.
 */

function clamp(val: number): number {
  return Math.max(0, Math.min(255, Math.round(val)))
}

export function adjustContrast(imageData: ImageData, factor: number): ImageData {
  const { data, width, height } = imageData
  const out = new Uint8ClampedArray(data.length)
  for (let i = 0; i < data.length; i += 4) {
    out[i] = clamp(128 + factor * (data[i] - 128))
    out[i + 1] = clamp(128 + factor * (data[i + 1] - 128))
    out[i + 2] = clamp(128 + factor * (data[i + 2] - 128))
    out[i + 3] = data[i + 3]
  }
  return new ImageData(out, width, height)
}

export function adjustBrightness(imageData: ImageData, offset: number): ImageData {
  const { data, width, height } = imageData
  const out = new Uint8ClampedArray(data.length)
  for (let i = 0; i < data.length; i += 4) {
    out[i] = clamp(data[i] + offset)
    out[i + 1] = clamp(data[i + 1] + offset)
    out[i + 2] = clamp(data[i + 2] + offset)
    out[i + 3] = data[i + 3]
  }
  return new ImageData(out, width, height)
}

function isThermalReceipt(imageData: ImageData): boolean {
  const { data } = imageData
  let minVal = 255
  let maxVal = 0
  let warmCount = 0
  const sampleSize = Math.min(data.length / 4, 1000) * 4
  for (let i = 0; i < sampleSize; i += 4) {
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
    minVal = Math.min(minVal, gray)
    maxVal = Math.max(maxVal, gray)
    if (data[i] > data[i + 2] + 10) warmCount++
  }
  const range = maxVal - minVal
  const warmRatio = warmCount / (sampleSize / 4)
  return range < 100 && warmRatio > 0.6
}

export function enhanceForOCR(imageData: ImageData): ImageData {
  let enhanced = imageData
  if (isThermalReceipt(imageData)) {
    enhanced = adjustContrast(enhanced, 2.0)
    enhanced = adjustBrightness(enhanced, 20)
  } else {
    enhanced = adjustContrast(enhanced, 1.3)
    enhanced = adjustBrightness(enhanced, 10)
  }
  return enhanced
}

export async function enhanceCanvasToFile(
  canvas: HTMLCanvasElement,
  filename: string,
): Promise<File> {
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Cannot get canvas context')
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const enhanced = enhanceForOCR(imageData)
  ctx.putImageData(enhanced, 0, 0)
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) return reject(new Error('Canvas to blob failed'))
        resolve(new File([blob], filename, { type: 'image/jpeg' }))
      },
      'image/jpeg',
      0.95,
    )
  })
}
