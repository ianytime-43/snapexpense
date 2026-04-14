/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['Fraunces', 'ui-serif', 'Georgia', 'serif'],
        sans: ['Instrument Sans', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        // Warm light mode (inspired by Expensify)
        cream: {
          50: '#FCFBF9',
          100: '#F8F4F0',
          200: '#F2EDE7',
          300: '#E6E1DA',
        },
        // Forest green dark mode
        forest: {
          900: '#061B09',
          800: '#072419',
          700: '#0A2E25',
          600: '#1A3D32',
          500: '#224F41',
          400: '#2A604F',
          300: '#8B9C8F',
          200: '#AFBBB0',
          100: '#E7ECE9',
        },
        // Editorial accent palette
        ink: '#151210',
        sienna: {
          500: '#B8472B',
          600: '#9B3A22',
          700: '#7D2D19',
        },
        gold: {
          500: '#B8923C',
          600: '#9A7A2F',
        },
      },
      letterSpacing: {
        tightest: '-0.04em',
        'editorial': '-0.025em',
      },
      animation: {
        'rise': 'rise 900ms cubic-bezier(0.16, 1, 0.3, 1) both',
        'fade-in': 'fadeIn 1200ms ease-out both',
        'shimmer': 'shimmer 2.4s ease-in-out infinite',
        'ticker': 'ticker 40s linear infinite',
      },
      keyframes: {
        rise: {
          '0%': { opacity: 0, transform: 'translateY(18px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' },
        },
        fadeIn: {
          '0%': { opacity: 0 },
          '100%': { opacity: 1 },
        },
        shimmer: {
          '0%, 100%': { opacity: 0.6 },
          '50%': { opacity: 1 },
        },
        ticker: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
      },
      backgroundImage: {
        'grain': "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.82' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.05 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
      },
    },
  },
  plugins: [],
}
