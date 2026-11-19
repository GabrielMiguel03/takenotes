/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#effdf7',
          100: '#d6faea',
          200: '#a8f3d2',
          300: '#6ee7b4',
          400: '#3ad198',
          500: '#14b87a',
          600: '#0d9f68',
          700: '#087d54',
          800: '#086642',
          900: '#075438',
          950: '#03301f',
        },
      },
    },
  },
  plugins: [],
}
