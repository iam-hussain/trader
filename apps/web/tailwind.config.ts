import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      colors: {
        bg: {
          base: "rgb(10 12 16)",
          surface: "rgb(17 20 26)",
          elevated: "rgb(24 28 36)",
        },
        border: { DEFAULT: "rgb(38 44 56)", strong: "rgb(58 66 80)" },
        fg: {
          DEFAULT: "rgb(230 235 245)",
          muted: "rgb(156 166 184)",
          subtle: "rgb(108 118 134)",
        },
        accent: { DEFAULT: "rgb(80 140 255)", hover: "rgb(110 160 255)" },
        pos: "rgb(60 200 130)",
        neg: "rgb(240 90 100)",
        warn: "rgb(240 180 60)",
      },
    },
  },
  plugins: [],
};
export default config;
