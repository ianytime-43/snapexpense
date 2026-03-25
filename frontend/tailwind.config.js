/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
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
      },
    },
  },
  plugins: [],
}
