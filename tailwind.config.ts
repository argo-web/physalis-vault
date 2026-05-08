import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Tokens du design system « Cuivre signature »
        bg: "var(--bg)",
        surface: "var(--surface)",
        fg: "var(--fg)",
        muted: "var(--muted)",
        border: "var(--border)",
        "border-strong": "var(--border-strong)",
        primary: "var(--primary)",
        "primary-hover": "var(--primary-hover)",
        accent: "var(--accent)",
        "accent-soft": "var(--accent-soft)",
        "accent-bg": "var(--accent-bg)",
        danger: "var(--danger)",
        "danger-bg": "var(--danger-bg)",
        "danger-fg": "var(--danger-fg)",
        success: "var(--success)",
        "code-bg": "var(--code-bg)",
        // Compat ancien systeme
        background: "var(--bg)",
        foreground: "var(--fg)",
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "Inter",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        mono: [
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "monospace",
        ],
      },
    },
  },
  plugins: [],
};

export default config;
