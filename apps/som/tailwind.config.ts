import type { Config } from 'tailwindcss';

// Colours come from CSS variables (app/globals.css), so "us" mode (aftercare
// and the scene record) can restyle everything by redefining them.
const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: v('ink'), soft: v('ink-soft'), faint: v('ink-faint') },
        paper: { DEFAULT: v('paper'), raised: v('paper-raised'), sunk: v('paper-sunk') },
        line: v('line'),
        lead: { DEFAULT: v('lead'), dark: v('lead-dark'), light: v('lead-light') },
        follow: { DEFAULT: v('follow'), dark: v('follow-dark'), light: v('follow-light') },
        ok: v('ok'),
        warn: { DEFAULT: v('warn'), light: v('warn-light') },
        stop: { DEFAULT: v('stop'), light: v('stop-light') },
      },
      fontFamily: {
        display: ['Georgia', '"Times New Roman"', 'serif'],
      },
    },
  },
  plugins: [],
} satisfies Config;
