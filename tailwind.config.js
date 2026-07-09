/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        base: {
          950: "#121116",
          900: "#18171D",
          800: "#211F27",
          700: "#2C2A33",
          600: "#3B3843",
          500: "#57545F",
          400: "#7C7885",
          300: "#A8A4AF",
          200: "#D2CFD8",
          100: "#EDEBF0",
        },
        gold: {
          600: "#B9862F",
          500: "#D9A441",
          400: "#E8BC63",
          300: "#F2D394",
        },
        teal: {
          600: "#137A6B",
          500: "#1A9A86",
          400: "#33B6A0",
        },
        danger: {
          500: "#C4453B",
        },
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["'Space Grotesk'", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["'JetBrains Mono'", "ui-monospace", "SFMono-Regular", "monospace"],
      },
    },
  },
  plugins: [],
};
