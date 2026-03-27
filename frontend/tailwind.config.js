/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        navy: {
          950: '#04070f',
          900: '#070a14',
          800: '#0b1020',
          700: '#101828',
          600: '#1a2540',
        },
        amber: {
          brand: '#ffb300',
          light: '#ffc533',
          glow: 'rgba(255,179,0,0.18)',
        },
        surface: {
          DEFAULT: '#f6f8fb',
          card: '#ffffff',
          border: '#e8edf6',
          muted: '#5c6b8a',
        },
      },
      fontFamily: {
        display: ['"DM Serif Display"', 'Georgia', 'serif'],
        mono: ['"JetBrains Mono"', '"Fira Code"', 'monospace'],
        sans: ['"Plus Jakarta Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 4px rgba(11,16,32,0.07), 0 4px 16px rgba(11,16,32,0.04)',
        'card-hover': '0 4px 20px rgba(11,16,32,0.12), 0 1px 4px rgba(11,16,32,0.06)',
        'amber-glow': '0 0 24px rgba(255,179,0,0.25)',
      },
      animation: {
        'fade-in': 'fadeIn 0.4s ease-out',
        'slide-up': 'slideUp 0.35s ease-out',
        'pulse-amber': 'pulseAmber 2s ease-in-out infinite',
        shimmer: 'shimmer 1.5s infinite',
      },
      keyframes: {
        fadeIn: { from: { opacity: '0' }, to: { opacity: '1' } },
        slideUp: { from: { opacity: '0', transform: 'translateY(12px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        pulseAmber: { '0%,100%': { opacity: '1' }, '50%': { opacity: '0.6' } },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
    },
  },
  plugins: [],
}
