import forms from '@tailwindcss/forms';
import typography from '@tailwindcss/typography';
import aspectRatio from '@tailwindcss/aspect-ratio';
import containerQueries from '@tailwindcss/container-queries';

export default {
  darkMode: 'class',
  content: [
    "./index.html", 
    "./*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./hooks/**/*.{js,ts,jsx,tsx}",
    "./lib/**/*.{js,ts,jsx,tsx}",
    "./services/**/*.{js,ts,jsx,tsx}",
    "./store/**/*.{js,ts,jsx,tsx}",
    "./types/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          app: 'rgb(var(--bg-app) / <alpha-value>)',
          panel: 'rgb(var(--bg-panel) / <alpha-value>)',
          element: 'rgb(var(--bg-element) / <alpha-value>)',
          hover: 'rgb(var(--bg-hover) / <alpha-value>)',
          overlay: 'rgb(var(--bg-overlay) / <alpha-value>)',
          track: 'rgb(var(--bg-track) / <alpha-value>)',
          scrollbar: 'rgb(var(--bg-scrollbar) / <alpha-value>)',
          'scrollbar-hover': 'rgb(var(--bg-scrollbar-hover) / <alpha-value>)',
        },
        bubble: {
          user: 'rgb(var(--bg-bubble-user) / <alpha-value>)',
          ai: 'rgb(var(--bg-bubble-ai) / <alpha-value>)',
        },
        text: {
          primary: 'rgb(var(--text-primary) / <alpha-value>)',
          secondary: 'rgb(var(--text-secondary) / <alpha-value>)',
          muted: 'rgb(var(--text-muted) / <alpha-value>)',
          'on-brand': 'rgb(var(--text-on-brand) / <alpha-value>)',
        },
        border: {
          base: 'rgb(var(--border-base) / <alpha-value>)',
          light: 'rgb(var(--border-light) / <alpha-value>)',
        },
        ring: {
          focus: 'rgb(var(--ring-focus) / <alpha-value>)',
        },
        brand: {
          primary: 'rgb(var(--brand-primary) / <alpha-value>)',
          hover: 'rgb(var(--brand-hover) / <alpha-value>)',
        },
        tint: {
          teal: {
            bg: 'rgb(var(--tint-teal-bg) / <alpha-value>)',
            border: 'rgb(var(--tint-teal-border) / <alpha-value>)',
            text: 'rgb(var(--tint-teal-text) / <alpha-value>)',
          },
          emerald: {
            bg: 'rgb(var(--tint-emerald-bg) / <alpha-value>)',
            border: 'rgb(var(--tint-emerald-border) / <alpha-value>)',
            text: 'rgb(var(--tint-emerald-text) / <alpha-value>)',
          },
          fuchsia: {
            bg: 'rgb(var(--tint-fuchsia-bg) / <alpha-value>)',
            border: 'rgb(var(--tint-fuchsia-border) / <alpha-value>)',
            text: 'rgb(var(--tint-fuchsia-text) / <alpha-value>)',
          },
          indigo: {
            bg: 'rgb(var(--tint-indigo-bg) / <alpha-value>)',
            border: 'rgb(var(--tint-indigo-border) / <alpha-value>)',
            text: 'rgb(var(--tint-indigo-text) / <alpha-value>)',
          },
          rose: {
            bg: 'rgb(var(--tint-rose-bg) / <alpha-value>)',
            border: 'rgb(var(--tint-rose-border) / <alpha-value>)',
            text: 'rgb(var(--tint-rose-text) / <alpha-value>)',
          },
          sky: {
            bg: 'rgb(var(--tint-sky-bg) / <alpha-value>)',
            border: 'rgb(var(--tint-sky-border) / <alpha-value>)',
            text: 'rgb(var(--tint-sky-text) / <alpha-value>)',
          },
          amber: {
            bg: 'rgb(var(--tint-amber-bg) / <alpha-value>)',
            border: 'rgb(var(--tint-amber-border) / <alpha-value>)',
            text: 'rgb(var(--tint-amber-text) / <alpha-value>)',
          },
          orange: {
            bg: 'rgb(var(--tint-orange-bg) / <alpha-value>)',
            border: 'rgb(var(--tint-orange-border) / <alpha-value>)',
            text: 'rgb(var(--tint-orange-text) / <alpha-value>)',
          },
          red: {
            bg: 'rgb(var(--tint-red-bg) / <alpha-value>)',
            border: 'rgb(var(--tint-red-border) / <alpha-value>)',
            text: 'rgb(var(--tint-red-text) / <alpha-value>)',
          },
          cyan: {
            bg: 'rgb(var(--tint-cyan-bg) / <alpha-value>)',
            border: 'rgb(var(--tint-cyan-border) / <alpha-value>)',
            text: 'rgb(var(--tint-cyan-text) / <alpha-value>)',
          },
          purple: {
            bg: 'rgb(var(--tint-purple-bg) / <alpha-value>)',
            border: 'rgb(var(--tint-purple-border) / <alpha-value>)',
            text: 'rgb(var(--tint-purple-text) / <alpha-value>)',
          },
          slate: {
            bg: 'rgb(var(--tint-slate-bg) / <alpha-value>)',
            border: 'rgb(var(--tint-slate-border) / <alpha-value>)',
            text: 'rgb(var(--tint-slate-text) / <alpha-value>)',
          },
        }
      },
      boxShadow: {
        panel: '0 10px 40px rgba(0,0,0,0.4)',
        glow: '0 4px 12px rgb(var(--brand-primary) / 0.3)',
      }
    },
  },
  plugins: [
    forms,
    typography,
    aspectRatio,
    containerQueries,
  ],
}
