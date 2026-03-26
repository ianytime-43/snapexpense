import { useState, useEffect } from 'react'

export function useBiometric() {
  const [isEnabled, setIsEnabled] = useState(() => localStorage.getItem('biometric_lock') === 'true')
  const [isSupported, setIsSupported] = useState(false)

  useEffect(() => {
    setIsSupported('credentials' in navigator && 'PublicKeyCredential' in window)
  }, [])

  const toggle = () => {
    const newState = !isEnabled
    localStorage.setItem('biometric_lock', String(newState))
    setIsEnabled(newState)
  }

  return { isEnabled, isSupported, toggle }
}
