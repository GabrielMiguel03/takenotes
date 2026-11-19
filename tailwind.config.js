/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { 50: '#effdf7', 500: '#14b87a', 600: '#0d9f68', 700: '#087d54' },
      },
    },
  },
  plugins: [],
}
