/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        jsl: {
          blue: '#1a3a5c',
          steel: '#4a7fa5',
          light: '#e8f0f7',
        },
      },
    },
  },
  plugins: [],
}
