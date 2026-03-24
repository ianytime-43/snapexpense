import { describe, it, expect } from 'vitest'
import { calculateBlurScore, isSharp } from '../blurDetector'

describe('calculateBlurScore', () => {
  it('returns a number between 0 and 1', () => {
    const data = new Uint8ClampedArray(4 * 4 * 4).fill(128)
    const imageData = new ImageData(data, 4, 4)
    const score = calculateBlurScore(imageData)
    expect(score).toBeGreaterThanOrEqual(0)
    expect(score).toBeLessThanOrEqual(1)
  })

  it('returns low score for uniform image (blurry)', () => {
    const data = new Uint8ClampedArray(10 * 10 * 4).fill(128)
    const imageData = new ImageData(data, 10, 10)
    const score = calculateBlurScore(imageData)
    expect(score).toBeLessThan(0.3)
  })

  it('returns high score for high-contrast image (sharp)', () => {
    const data = new Uint8ClampedArray(10 * 10 * 4)
    for (let i = 0; i < data.length; i += 4) {
      const pixel = Math.floor(i / 4)
      const val = pixel % 2 === 0 ? 0 : 255
      data[i] = val
      data[i + 1] = val
      data[i + 2] = val
      data[i + 3] = 255
    }
    const imageData = new ImageData(data, 10, 10)
    const score = calculateBlurScore(imageData)
    expect(score).toBeGreaterThan(0.5)
  })
})

describe('isSharp', () => {
  it('returns false for blurry image', () => {
    const data = new Uint8ClampedArray(10 * 10 * 4).fill(128)
    const imageData = new ImageData(data, 10, 10)
    expect(isSharp(imageData)).toBe(false)
  })

  it('accepts custom threshold', () => {
    const data = new Uint8ClampedArray(10 * 10 * 4).fill(128)
    const imageData = new ImageData(data, 10, 10)
    expect(isSharp(imageData, 0.01)).toBe(false)
  })
})
