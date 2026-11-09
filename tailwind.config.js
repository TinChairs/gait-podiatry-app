/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        peak: {
          DEFAULT: "#009456",
          dark: "#007a46",
          light: "#00b368",
          surface: "#181818",
          bg: "#121212",
          card: "#202020",
          border: "#282828"
        }
      }
    },
  },
  plugins: [],
}
