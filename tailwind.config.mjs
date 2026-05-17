/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        nutries: {
          red:    { 50:'#fff1f1', 100:'#ffe0e0', 200:'#ffc5c5', 400:'#f87171', 500:'#ef4444', 600:'#dc2626', 700:'#b91c1c', 800:'#991b1b', 900:'#7f1d1d' },
          green:  { 50:'#f0fdf4', 100:'#dcfce7', 200:'#bbf7d0', 400:'#4ade80', 500:'#22c55e', 600:'#16a34a', 700:'#15803d', 800:'#166534', 900:'#14532d' },
          brown:  { 50:'#fdf6ee', 100:'#fdefd8', 200:'#fad9a8', 400:'#f59e0b', 500:'#d97706', 600:'#b45309', 700:'#92400e', 800:'#78350f', 900:'#451a03' },
          indigo: { 50:'#eef2ff', 100:'#e0e7ff', 200:'#c7d2fe', 400:'#818cf8', 500:'#6366f1', 600:'#4f46e5', 700:'#4338ca', 800:'#3730a3', 900:'#312e81' },
          grey:   { 50:'#f9fafb', 100:'#f3f4f6', 200:'#e5e7eb', 300:'#d1d5db', 400:'#9ca3af', 500:'#6b7280', 600:'#4b5563', 700:'#374151', 800:'#1f2937', 900:'#111827' },
        },
        brand: {
          50:  '#eff6ff', 100: '#dbeafe', 200: '#bfdbfe',
          500: '#3b82f6', 600: '#2563eb', 700: '#1d4ed8',
          800: '#1e40af', 900: '#1e3a8a',
        },
      },
      fontFamily: {
        sans:    ['Inter', 'system-ui', 'sans-serif'],
        display: ['Playfair Display', 'Georgia', 'serif'],
      },
      backgroundImage: {
        'hero-gradient':   'linear-gradient(135deg, #312e81 0%, #1e3a5f 40%, #14532d 100%)',
        'card-glass':      'linear-gradient(135deg, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0.05) 100%)',
        'btn-red':         'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)',
        'btn-green':       'linear-gradient(135deg, #22c55e 0%, #15803d 100%)',
        'btn-indigo':      'linear-gradient(135deg, #6366f1 0%, #4338ca 100%)',
        'section-warm':    'linear-gradient(135deg, #fdf6ee 0%, #f0fdf4 100%)',
        'section-dark':    'linear-gradient(135deg, #1e1b4b 0%, #0f2027 100%)',
      },
      boxShadow: {
        'glass':   '0 8px 32px 0 rgba(31, 38, 135, 0.15)',
        'glow-r':  '0 0 30px rgba(220, 38, 38, 0.35)',
        'glow-g':  '0 0 30px rgba(34, 197, 94, 0.35)',
        'glow-i':  '0 0 30px rgba(99, 102, 241, 0.35)',
        'product': '0 20px 60px rgba(0,0,0,0.2)',
      },
      backdropBlur: { xs: '2px' },
      animation: {
        'float':      'float 4s ease-in-out infinite',
        'fade-up':    'fadeUp 0.6s ease-out forwards',
        'slide-in':   'slideIn 0.35s ease-out forwards',
        'pulse-slow': 'pulse 3s ease-in-out infinite',
      },
      keyframes: {
        float:   { '0%,100%': { transform: 'translateY(0px)' }, '50%': { transform: 'translateY(-12px)' } },
        fadeUp:  { from: { opacity: '0', transform: 'translateY(24px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        slideIn: { from: { transform: 'translateX(100%)' }, to: { transform: 'translateX(0)' } },
      },
    },
  },
  plugins: [],
};
