import type { Config } from "tailwindcss";

/**
 * Tailwind is kept thin in this project — most styling lives in the global
 * design tokens (./app/globals.css). The colors below are utility wrappers
 * around the CSS custom properties so we can mix Tailwind utilities with the
 * design-token classes.
 */
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  darkMode: ["class", '[data-theme="dark"]'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Geist"', "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ['"Geist Mono"', "ui-monospace", "monospace"],
      },
      colors: {
        bg: {
          DEFAULT: "var(--bg)",
          1: "var(--bg-elev-1)",
          2: "var(--bg-elev-2)",
          3: "var(--bg-elev-3)",
          // legacy P1 aliases used by older components
          base: "var(--bg)",
          surface: "var(--bg-elev-1)",
          elevated: "var(--bg-elev-2)",
        },
        border: {
          DEFAULT: "var(--border)",
          strong: "var(--border-strong)",
        },
        fg: {
          DEFAULT: "var(--text)",
          muted: "var(--text-muted)",
          dim: "var(--text-dim)",
          // legacy alias
          subtle: "var(--text-dim)",
        },
        primary: "var(--primary)",
        success: "var(--success)",
        danger: "var(--danger)",
        warning: "var(--warning)",
        destructive: "var(--destructive)",
        // legacy aliases (used in older P1 code)
        accent: "var(--primary)",
        pos: "var(--success)",
        neg: "var(--danger)",
        warn: "var(--warning)",
      },
      borderRadius: {
        DEFAULT: "var(--radius)",
        lg: "var(--radius-lg)",
      },
    },
  },
  plugins: [],
};
export default config;
