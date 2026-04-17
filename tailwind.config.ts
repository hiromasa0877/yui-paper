import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f5f2eb',
          100: '#ede7dd',
          200: '#dccfbb',
          300: '#c9a962',
          400: '#b89450',
          500: '#a67f3e',
          600: '#946a2c',
          700: '#7a541e',
          800: '#603e16',
          900: '#46280e',
        },
        indigo: {
          50: '#f0f4f8',
          100: '#d9e2f3',
          200: '#b3c5e7',
          300: '#8da8db',
          400: '#678bcf',
          500: '#415ec3',
          600: '#1a1a2e',
          700: '#14132b',
          800: '#0e0c28',
          900: '#080625',
        },
        accent: {
          teal: '#3a7c8c',
          gold: '#c9a962',
          cream: '#f5f2eb',
          dark: '#1a1a2e',
        },
      },
      fontFamily: {
        sans: ['"Noto Sans JP"', 'sans-serif'],
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-in-out',
        'scale-up': 'scaleUp 0.5s ease-in-out',
        'checkmark': 'checkmark 0.6s ease-in-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        scaleUp: {
          '0%': { transform: 'scale(0.9)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        checkmark: {
          '0%': { transform: 'scale(0)', opacity: '0' },
          '50%': { transform: 'scale(1.1)' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
