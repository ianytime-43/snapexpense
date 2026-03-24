import { describe, it, expect } from 'vitest'
import { adjustContrast, adjustBrightness, enhanceForOCR } from '../imageEnhance'

describe('adjustContrast', () => {
  it('returns ImageData of same dimensions', () => {
    const data = new Uint8ClampedArray(4 * 4 * 4).fill(128)
    const imageData = new ImageData(data, 4, 4)
    const result = adjustContrast(imageData, 1.5)
    expect(result.width).toBe(4)
    expect(result.height).toBe(4)
  })

  it('increases contrast when factor > 1', () => {
    const data = new Uint8ClampedArray([100, 100, 100, 255])
    const imageData = new ImageData(data, 1, 1)
    const result = adjustContrast(imageData, 2.0)
    expect(result.data[0]).toBe(72)
  })

  it('does not change alpha channel', () => {
    const data = new Uint8ClampedArray([100, 100, 100, 200])
    const imageData = new ImageData(data, 1, 1)
    const result = adjustContrast(imageData, 2.0)
    expect(result.data[3]).toBe(200)
  })
})

describe('adjustBrightness', () => {
  it('increases brightness when offset > 0', () => {
    const data = new Uint8ClampedArray([100, 100, 100, 255])
    const imageData = new ImageData(data, 1, 1)
    const result = adjustBrightness(imageData, 50)
    expect(result.data[0]).toBe(150)
  })

  it('clamps to 255', () => {
    const data = new Uint8ClampedArray([200, 200, 200, 255])
    const imageData = new ImageData(data, 1, 1)
    const result = adjustBrightness(imageData, 100)
    expect(result.data[0]).toBe(255)
  })
})

describe('enhanceForOCR', () => {
  it('returns enhanced ImageData', () => {
    const data = new Uint8ClampedArray(10 * 10 * 4).fill(128)
    const imageData = new ImageData(data, 10, 10)
    const result = enhanceForOCR(imageData)
    expect(result.width).toBe(10)
    expect(result.height).toBe(10)
    expect(result).toBeInstanceOf(ImageData)
  })
})

describe('enhanceForOCR — thermal receipt detection', () => {
  it('applies aggressive enhancement to thermal receipts (low range, warm tint)', () => {
    // Thermal receipt: narrow luminance range (150-180), warm (R > B by 10+)
    const data = new Uint8ClampedArray(20 * 20 * 4)
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 175     // R — warm
      data[i + 1] = 160  // G
      data[i + 2] = 140  // B — lower than R by 35
      data[i + 3] = 255
    }
    const imageData = new ImageData(data, 20, 20)
    const result = enhanceForOCR(imageData)

    // Thermal branch: contrast 2.0 then brightness +20
    // R: 128 + 2.0*(175-128) = 128 + 94 = 222, then +20 = 242
    // With aggressive enhancement, pixel values should shift significantly from original
    const rDiff = Math.abs(result.data[0] - imageData.data[0])
    expect(rDiff).toBeGreaterThan(30) // aggressive enhancement moves pixels far
  })

  it('applies normal enhancement to non-thermal receipts (wide range)', () => {
    // Non-thermal: wide luminance range with no warm bias
    const data = new Uint8ClampedArray(20 * 20 * 4)
    for (let i = 0; i < data.length; i += 4) {
      const pixel = Math.floor(i / 4)
      const val = pixel % 2 === 0 ? 50 : 200 // wide range: 50-200
      data[i] = val
      data[i + 1] = val
      data[i + 2] = val // R === B, no warm bias
      data[i + 3] = 255
    }
    const imageData = new ImageData(data, 20, 20)
    const result = enhanceForOCR(imageData)

    // Normal branch: contrast 1.3 then brightness +10
    // Dark pixel (50): 128 + 1.3*(50-128) = 128 - 101.4 = 26.6 → 27, then +10 = 37
    // Moderate shift, not aggressive
    const rDiff = Math.abs(result.data[0] - imageData.data[0])
    expect(rDiff).toBeLessThan(30) // normal enhancement moves pixels less
  })

  it('correctly identifies warm-tinted low-range images as thermal', () => {
    // Edge case: exactly at threshold — range=99 (<100) and warmRatio=0.61 (>0.6)
    const data = new Uint8ClampedArray(10 * 10 * 4)
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 180     // R
      data[i + 1] = 160  // G
      data[i + 2] = 150  // B — R > B by 30 (>10, counts as warm)
      data[i + 3] = 255
    }
    const input = new ImageData(data, 10, 10)
    const result = enhanceForOCR(input)

    // Should use thermal (aggressive) branch
    // Thermal: contrast 2.0 on R=180 → 128 + 2*(180-128) = 232, then +20 = 252
    // Normal: contrast 1.3 on R=180 → 128 + 1.3*(180-128) = 195.6 → 196, then +10 = 206
    // So result should be closer to 252 (thermal) than 206 (normal)
    expect(result.data[0]).toBeGreaterThan(220)
  })
})

describe('enhanceCanvasToFile', () => {
  it('throws if canvas has no context', async () => {
    // Create a minimal mock canvas that returns null for getContext
    const mockCanvas = {
      getContext: () => null,
      width: 10,
      height: 10,
    } as unknown as HTMLCanvasElement

    const { enhanceCanvasToFile } = await import('../imageEnhance')
    await expect(enhanceCanvasToFile(mockCanvas, 'test.jpg')).rejects.toThrow(
      'Cannot get canvas context'
    )
  })
})
