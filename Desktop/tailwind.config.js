/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/renderer/index.html",
    "./src/renderer/src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        sync: {
          bg: '#090e17',
          surface: '#0f172a',
          card: 'rgba(15, 23, 42, 0.75)',
          'card-hover': 'rgba(30, 41, 59, 0.85)',
          border: 'rgba(255, 255, 255, 0.08)',
          'border-focus': 'rgba(20, 184, 166, 0.5)',
          teal: {
            300: '#5eead4',
            400: '#2dd4bf',
            500: '#14b8a6',
            600: '#0d9488',
          },
          blue: {
            400: '#38bdf8',
            500: '#0ea5e9',
            600: '#0284c7',
          },
          cyan: '#06b6d4',
          indigo: '#6366f1',
        },
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
      },
    },
  },
  plugins: [],
}
