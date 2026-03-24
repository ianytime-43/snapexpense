/**
 * GPS utilities for receipt location capture.
 * - getCurrentPosition(): browser geolocation
 * - extractExifGps(): read GPS from photo EXIF metadata
 */

export interface GpsCoords {
  lat: number
  lng: number
}

/**
 * Get current GPS position from browser.
 * Returns null if unavailable or denied. Never throws.
 */
export function getCurrentPosition(): Promise<GpsCoords | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null)
      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        })
      },
      () => {
        resolve(null)
      },
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 60000 }
    )
  })
}

/**
 * Extract GPS coordinates from a photo's EXIF metadata.
 * Uses the file's ArrayBuffer to read EXIF data.
 * Returns null if no GPS data found or file is not a JPEG.
 */
export async function extractExifGps(file: File): Promise<GpsCoords | null> {
  try {
    const buffer = await file.arrayBuffer()
    const view = new DataView(buffer)

    // Check for JPEG SOI marker
    if (view.getUint16(0) !== 0xFFD8) return null

    // Find EXIF APP1 marker
    let offset = 2
    while (offset < view.byteLength - 2) {
      const marker = view.getUint16(offset)
      if (marker === 0xFFE1) {
        // APP1 marker found
        const length = view.getUint16(offset + 2)
        const exifData = parseExifGps(view, offset + 4, length)
        if (exifData) return exifData
      }
      if ((marker & 0xFF00) !== 0xFF00) break
      const segLen = view.getUint16(offset + 2)
      offset += 2 + segLen
    }

    return null
  } catch {
    return null
  }
}

/**
 * Parse GPS data from EXIF APP1 segment.
 * Looks for GPS IFD and extracts latitude/longitude.
 */
function parseExifGps(view: DataView, start: number, _length: number): GpsCoords | null {
  try {
    // Check for "Exif\0\0" header
    const exifHeader = String.fromCharCode(
      view.getUint8(start), view.getUint8(start + 1),
      view.getUint8(start + 2), view.getUint8(start + 3),
    )
    if (exifHeader !== 'Exif') return null

    const tiffStart = start + 6
    const bigEndian = view.getUint16(tiffStart) === 0x4D4D

    const getU16 = (o: number) => view.getUint16(o, !bigEndian)
    const getU32 = (o: number) => view.getUint32(o, !bigEndian)

    // Read IFD0
    const ifd0Offset = getU32(tiffStart + 4)
    const ifd0Count = getU16(tiffStart + ifd0Offset)

    // Find GPS IFD pointer (tag 0x8825)
    let gpsIfdOffset: number | null = null
    for (let i = 0; i < ifd0Count; i++) {
      const entryOffset = tiffStart + ifd0Offset + 2 + i * 12
      const tag = getU16(entryOffset)
      if (tag === 0x8825) {
        gpsIfdOffset = getU32(entryOffset + 8)
        break
      }
    }

    if (gpsIfdOffset === null) return null

    // Read GPS IFD
    const gpsCount = getU16(tiffStart + gpsIfdOffset)
    let latRef: string | null = null
    let lngRef: string | null = null
    let latValues: number[] | null = null
    let lngValues: number[] | null = null

    for (let i = 0; i < gpsCount; i++) {
      const entryOffset = tiffStart + gpsIfdOffset + 2 + i * 12
      const tag = getU16(entryOffset)
      const valueOffset = getU32(entryOffset + 8)

      switch (tag) {
        case 1: // GPSLatitudeRef
          latRef = String.fromCharCode(view.getUint8(entryOffset + 8))
          break
        case 2: // GPSLatitude
          latValues = readRationals(view, tiffStart + valueOffset, 3, !bigEndian)
          break
        case 3: // GPSLongitudeRef
          lngRef = String.fromCharCode(view.getUint8(entryOffset + 8))
          break
        case 4: // GPSLongitude
          lngValues = readRationals(view, tiffStart + valueOffset, 3, !bigEndian)
          break
      }
    }

    if (!latValues || !lngValues || !latRef || !lngRef) return null

    let lat = latValues[0] + latValues[1] / 60 + latValues[2] / 3600
    let lng = lngValues[0] + lngValues[1] / 60 + lngValues[2] / 3600

    if (latRef === 'S') lat = -lat
    if (lngRef === 'W') lng = -lng

    return { lat, lng }
  } catch {
    return null
  }
}

function readRationals(view: DataView, offset: number, count: number, littleEndian: boolean): number[] {
  const values: number[] = []
  for (let i = 0; i < count; i++) {
    const num = view.getUint32(offset + i * 8, littleEndian)
    const den = view.getUint32(offset + i * 8 + 4, littleEndian)
    values.push(den === 0 ? 0 : num / den)
  }
  return values
}
