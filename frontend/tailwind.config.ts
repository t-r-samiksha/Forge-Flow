import type { Config } from "tailwindcss";

/** Every color reads from the CSS variables defined in app/globals.css
 * (dark under :root, light under :root[data-theme="light"]) via the
 * `rgb(var(--x-rgb) / <alpha-value>)` function form — this is what lets
 * Tailwind's opacity-modifier syntax (`bg-violet/40`) keep working while
 * every value stays theme-driven. No literal hex here; add a new color
 * by adding its -rgb variable in both root blocks first. */
function themeColor(varName: string): string {
  return `rgb(var(--color-${varName}-rgb) / <alpha-value>)`;
}

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        void: themeColor("void"),
        "void-2": themeColor("void-2"),
        panel: themeColor("panel"),
        "panel-2": themeColor("panel-2"),
        "panel-3": themeColor("panel-3"),
        "code-bg": themeColor("code-bg"),
        line: themeColor("line"),
        "line-2": themeColor("line-2"),
        text: themeColor("text"),
        "code-text": themeColor("code-text"),
        dim: themeColor("dim"),
        mute: themeColor("mute"),
        violet: themeColor("violet"),
        "violet-hi": themeColor("violet-hi"),
        "violet-deep": themeColor("violet-deep"),
        "violet-dim": "rgb(var(--color-violet-rgb) / 0.14)",
        plasma: themeColor("plasma"),
        "plasma-hi": themeColor("plasma-hi"),
        "plasma-deep": themeColor("plasma-deep"),
        "plasma-dim": "rgb(var(--color-plasma-rgb) / 0.12)",
        spring: themeColor("spring"),
        "spring-dim": "rgb(var(--color-spring-rgb) / 0.12)",
        amber: themeColor("amber"),
        rose: themeColor("rose"),
        ember: themeColor("ember"),
        "ember-dim": "rgb(var(--color-ember-rgb) / 0.14)",
        social: themeColor("social"),
        "on-accent": themeColor("on-accent"),
        "on-spring": themeColor("on-spring"),
      },
      fontFamily: {
        display: ["Space Grotesk", "sans-serif"],
        body: ["Inter", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      transitionTimingFunction: {
        ease: "cubic-bezier(.4, 0, .2, 1)",
        "spring-ease": "cubic-bezier(.34, 1.56, .64, 1)",
      },
    },
  },
  plugins: [],
};
export default config;
