import type { Config } from "tailwindcss";

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        "on-secondary-container": "#d1d0d0",
        "on-tertiary": "#5c1878",
        "on-surface-variant": "#acabaa",
        "surface-container": "#191a1a",
        "surface-container-low": "#131314",
        "on-secondary-fixed-variant": "#5b5b5b",
        "tertiary-fixed-dim": "#cf87eb",
        "secondary-fixed-dim": "#d5d4d4",
        "on-primary-fixed": "#000000",
        "inverse-on-surface": "#555555",
        "tertiary-container": "#de94fa",
        "on-primary-container": "#002346",
        "secondary-fixed": "#e3e2e2",
        "primary-dim": "#4fa0ff",
        secondary: "#e3e2e2",
        primary: "#75b0ff",
        "on-error": "#490006",
        "on-surface": "#ffffff",
        "on-tertiary-fixed": "#2c003f",
        "inverse-surface": "#fbf9f8",
        "secondary-dim": "#d5d4d4",
        "on-tertiary-fixed-variant": "#5b1677",
        "secondary-container": "#464747",
        surface: "#0e0e0e",
        outline: "#767575",
        "outline-variant": "#484848",
        "error-container": "#9f0519",
        "tertiary-dim": "#cf87eb",
        background: "#0e0e0e",
        "surface-container-highest": "#252626",
        error: "#ff716c",
        "surface-dim": "#0e0e0e",
        "on-secondary": "#515252",
        "on-secondary-fixed": "#3f3f3f",
        tertiary: "#e7a6ff",
        "surface-container-high": "#1f2020",
        "surface-tint": "#75b0ff",
        "on-background": "#ffffff",
        "surface-variant": "#252626",
        "on-tertiary-container": "#51086e",
        "on-primary-fixed-variant": "#002d56",
        "primary-fixed-dim": "#3e95f6",
        "surface-container-lowest": "#000000",
        "primary-fixed": "#56a3ff",
        "primary-container": "#56a3ff",
        "on-error-container": "#ffa8a3",
        "error-dim": "#d7383b",
        "tertiary-fixed": "#de94fa",
        "on-primary": "#002f5a",
        "surface-bright": "#2b2c2c",
        "inverse-primary": "#0060ae"
      },
      borderRadius: {
        sm: "8px",
        DEFAULT: "10px",
        md: "10px",
        lg: "10px",
        xl: "10px",
        "2xl": "12px",
        full: "9999px"
      },
      fontFamily: {
        headline: ["Plus Jakarta Sans", "sans-serif"],
        body: ["Ubuntu", "sans-serif"],
        label: ["Ubuntu", "sans-serif"]
      }
    }
  },
  plugins: []
} satisfies Config;
