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
