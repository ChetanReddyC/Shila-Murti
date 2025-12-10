/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx}",
    "./src/components/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      fontFamily: {
        cinzel: ['var(--font-cinzel)'],
        inter: ['var(--font-inter)'],
        sans: ['var(--font-inter)', 'sans-serif'], // Set inter as default sans
      },
      colors: {
        shila: {
          gold: '#D4AF37', // "Divine" gold
          goldlight: '#F5E6BE',
          stone: '#1c1917',
        }
      }
    },
  },
  plugins: [require("@tailwindcss/forms"), require("@tailwindcss/container-queries")],
}; 