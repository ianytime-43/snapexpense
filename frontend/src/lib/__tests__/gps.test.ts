import { describe, it, expect, vi } from 'vitest'
import { getCurrentPosition, type GpsCoords } from '../gps'

describe('getCurrentPosition', () => {
  it('returns coordinates when geolocation succeeds', async () => {
    const mockPosition = {
      coords: { latitude: 43.6532, longitude: -79.3832 },
    }
    vi.stubGlobal('navigator', {
      geolocation: {
        getCurrentPosition: (success: (pos: typeof mockPosition) => void) => {
          success(mockPosition)
        },
      },
    })

    const result = await getCurrentPosition()
    expect(result).toEqual({ lat: 43.6532, lng: -79.3832 })
  })

  it('returns null when geolocation fails', async () => {
    vi.stubGlobal('navigator', {
      geolocation: {
        getCurrentPosition: (_: unknown, error: (err: GeolocationPositionError) => void) => {
          error({ code: 1, message: 'User denied', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError)
        },
      },
    })

    const result = await getCurrentPosition()
    expect(result).toBeNull()
  })

  it('returns null when geolocation is not available', async () => {
    vi.stubGlobal('navigator', {})

    const result = await getCurrentPosition()
    expect(result).toBeNull()
  })
})
