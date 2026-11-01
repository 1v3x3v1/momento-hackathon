/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: '#F4F9F6',
        card: '#FFFFFF',
        primary: '#1A5D4A',
        primaryHover: '#134537',
        textMain: '#1F2937',
        textMuted: '#6B7280',
        borderSoft: '#E5E7EB',
        darkBackground: '#111827',
        darkCard: '#1F2937',
        darkTextMain: '#F9FAFB',
        darkTextMuted: '#9CA3AF',
        darkBorderSoft: '#374151',
        // Add the selection colors here
        selectionFill: 'rgba(249, 115, 22, 0.3)', // Orange fill
        selectionBorder: 'rgba(0, 0, 0, 1)', // Black border
      },
      fontFamily: {
        serif: ['Playfair Display', 'serif'],
        sans: ['Inter', 'sans-serif'],
      }
    },
  },
  plugins: [],
}