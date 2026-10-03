import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#e6f2ff',
          100: '#cce6ff',
          200: '#99ccff',
          300: '#66b3ff',
          400: '#3399ff',
          500: '#007fff',
          600: '#0072e6',
          700: '#0066cc',
          800: '#004d99',
          900: '#003a75',
        },
        vibrant: {
          purple: '#800080',
          blue: '#007fff',
        },
        ink: {
          900: '#05060a',
          800: '#0b0e14',
          700: '#111827',
          600: '#1f2937',
        },
      },
      fontFamily: {
        headline: ['var(--font-headline)', 'Montserrat', 'sans-serif'],
        body: ['var(--font-body)', 'Roboto', 'sans-serif'],
      },
      backgroundImage: {
        'keera-gradient': 'linear-gradient(90deg, #800080 0%, #007fff 100%)',
      },
    },
  },
  plugins: [],
};

export default config;
