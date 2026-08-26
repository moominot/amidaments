/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // El commutador Pressupost/Certificació del capçal fa servir `xs:`, que Tailwind
      // no defineix per defecte: sense això les etiquetes quedaven amagades sempre.
      screens: {
        xs: '475px',
      },
    },
  },
  plugins: [],
}
