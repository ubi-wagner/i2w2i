import type { Config } from 'tailwindcss';

// stone and brand come from CSS variables (app/globals.css) so an event's
// theme can restyle every component on its pages by redefining them.
const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;
const stone = Object.fromEntries([50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950].map((n) => [n, v(`stone-${n}`)]));

export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        stone,
        brand: { DEFAULT: v('brand'), dark: v('brand-dark'), light: v('brand-light') },
      },
      fontFamily: {
        display: ['"Cormorant Garamond"', 'Georgia', 'serif'],
        script: ['"Pinyon Script"', 'cursive'],
      },
    },
  },
  plugins: [],
} satisfies Config;
