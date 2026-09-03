import type { Config } from 'tailwindcss';

/**
 * The palette is deliberately small (brief §8, design direction). One accent is reserved
 * for money at risk and nothing else competes with it; a second, quieter tone marks
 * dollars already removed. Everything else is ink on paper.
 */
export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#FBFAF7',
        card: '#FFFFFF',
        ink: {
          DEFAULT: '#16150F',
          muted: '#5C5A50',
          faint: '#8B8879',
        },
        rule: '#E2DFD5',
        'rule-strong': '#C9C5B7',
        risk: {
          DEFAULT: '#9E2B1B',
          soft: '#FBEFEC',
          rule: '#E8C4BB',
        },
        cleared: {
          DEFAULT: '#2E5C42',
          soft: '#EDF3EE',
        },
        note: '#8A6A17',
      },
      fontFamily: {
        sans: [
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      maxWidth: {
        workpaper: '82rem',
      },
    },
  },
  plugins: [],
} satisfies Config;
