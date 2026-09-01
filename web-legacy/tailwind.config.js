// Copyright 2026 Zyvor
// SPDX-License-Identifier: Apache-2.0

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  safelist: [
    'bg-gradient-to-r', 'bg-gradient-to-br', 'bg-gradient-to-b',
    'from-blue-400', 'from-blue-500', 'from-blue-600', 'from-blue-700', 'from-blue-800',
    'from-cyan-400', 'from-cyan-500', 'from-cyan-600',
    'from-orange-400', 'from-orange-500', 'from-orange-600', 'from-orange-800',
    'from-amber-500', 'from-amber-600', 'from-amber-800',
    'from-red-400', 'from-red-500', 'from-red-600', 'from-red-700', 'from-red-800', 'from-red-900',
    'from-green-500', 'from-green-600', 'from-green-700',
    'from-emerald-500', 'from-emerald-500/10', 'from-emerald-500/20',
    'from-indigo-500', 'from-indigo-600',
    'from-purple-700', 'from-purple-800',
    'from-violet-500/10',
    'from-cyan-500/10',
    'from-yellow-600', 'from-yellow-700', 'from-yellow-800',
    'from-slate-600', 'from-slate-700', 'from-slate-800',
    'from-red-600/20', 'from-red-500/20', 'from-green-500/20',
    'to-blue-600', 'to-blue-700', 'to-blue-800',
    'to-cyan-400', 'to-cyan-500', 'to-cyan-600',
    'to-orange-600', 'to-orange-700', 'to-orange-800',
    'to-amber-600', 'to-amber-800',
    'to-red-700', 'to-red-800', 'to-red-900',
    'to-green-600', 'to-green-700',
    'to-emerald-500/20',
    'to-indigo-700',
    'to-purple-700', 'to-purple-800',
    'to-yellow-600', 'to-yellow-700', 'to-yellow-800',
    'to-slate-700', 'to-slate-800', 'to-slate-800/50',
    'to-red-700/20', 'to-rose-500/20',
    'via-cyan-500',
    'bg-clip-text', 'text-transparent',
    'hover:from-blue-500', 'hover:from-blue-600',
    'hover:to-blue-600', 'hover:to-blue-700',
    'hover:from-green-500', 'hover:to-green-600',
    'hover:from-slate-600', 'hover:to-slate-700',
    'hover:from-red-500/30', 'hover:to-red-600/30',
    'hover:brightness-110',
    'shadow-lg', 'shadow-md', 'shadow-sm',
    'shadow-blue-500/20', 'shadow-blue-500/25', 'shadow-blue-500/5', 'shadow-blue-500/10',
    'shadow-green-500/20',
    'hover:scale-[1.02]',
    'border-t-2', 'border-t-blue-500/30', 'border-t-blue-500/50',
    'border-l-2', 'border-l-blue-400', 'border-l-blue-500',
  ],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.2s ease-out',
      },
    },
  },
  plugins: [],
}
