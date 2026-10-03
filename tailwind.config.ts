import type { Config } from 'tailwindcss';

export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: '#7c3aed', dark: '#5b21b6', light: '#ede9fe' },
      },
    },
  },
  plugins: [],
} satisfies Config;
