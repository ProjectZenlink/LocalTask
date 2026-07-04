/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#F2EFE8',
        surface: '#FBFAF6',
        ink: { DEFAULT: '#1E1D19', soft: '#3A3934' },
        muted: '#77746C',
        faint: '#A29E93',
        hair: '#E6E2D8',
        petrol: { DEFAULT: '#244B4D', hover: '#2A5457' },
        verified: { DEFAULT: '#3E7A57', text: '#3B6A50', border: '#C9DCCB', bg: '#EDF1EC' },
        pending: { DEFAULT: '#B07A2E', text: '#8A6220', border: '#E4D3B0', bg: '#F4ECDC' },
        inactive: { DEFAULT: '#A8A499', text: '#6B6860', border: '#DED9CD' },
        danger: { DEFAULT: '#8A2E2E', text: '#8A2E2E', border: '#E4C0C0', bg: '#F6EAEA' },
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"Space Mono"', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
}
