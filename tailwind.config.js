/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './App.tsx',
    './index.tsx',
    './clients/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
    './layout/**/*.{js,ts,jsx,tsx}',
    './pages/**/*.{js,ts,jsx,tsx}',
    './types/**/*.{js,ts,jsx,tsx}',
    './utils/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        code: {
          output: '#d6deeb',
          muted: '#9aa7bd',
          panel: '#0b1020',
        },
        chat: {
          user: '#343541',
        },
        chart: {
          logic: '#2563eb',
          logic1: '#bfdbfe',
          logic2: '#60a5fa',
          logic3: '#2563eb',
          structure: '#8b5cf6',
          structure1: '#ddd6fe',
          structure2: '#a78bfa',
          structure3: '#8b5cf6',
          readability: '#16a34a',
          readability1: '#bbf7d0',
          readability2: '#4ade80',
          readability3: '#16a34a',
          round1: '#cbd5e1',
          round2: '#64748b',
          round3: '#0f172a',
          grid: '#cbd5e1',
          axis: '#64748b',
        },
      },
      borderRadius: {
        panel: '1.6rem',
        section: '2.25rem',
        card: '2rem',
        timeline: '1.35rem',
        detail: '1.5rem',
      },
      boxShadow: {
        panel: '0 18px 45px rgba(15,23,42,0.08)',
        section: '0 28px 80px rgba(15,23,42,0.12)',
      },
      backgroundImage: {
        'review-panel': 'radial-gradient(circle at top left, rgba(16,185,129,0.16), transparent 30%), linear-gradient(135deg, #ffffff 0%, #f8fafc 46%, #eef6ff 100%)',
      },
    },
  },
  plugins: [
    ({ addBase, theme }) => {
      addBase({
        ':root': {
          '--color-white': theme('colors.white'),
          '--color-slate-500': theme('colors.slate.500'),
          '--color-rose-600': theme('colors.rose.600'),
          '--color-amber-600': theme('colors.amber.600'),
          '--color-emerald-600': theme('colors.emerald.600'),
          '--color-chart-logic': theme('colors.chart.logic'),
          '--color-chart-logic1': theme('colors.chart.logic1'),
          '--color-chart-logic2': theme('colors.chart.logic2'),
          '--color-chart-logic3': theme('colors.chart.logic3'),
          '--color-chart-structure': theme('colors.chart.structure'),
          '--color-chart-structure1': theme('colors.chart.structure1'),
          '--color-chart-structure2': theme('colors.chart.structure2'),
          '--color-chart-structure3': theme('colors.chart.structure3'),
          '--color-chart-readability': theme('colors.chart.readability'),
          '--color-chart-readability1': theme('colors.chart.readability1'),
          '--color-chart-readability2': theme('colors.chart.readability2'),
          '--color-chart-readability3': theme('colors.chart.readability3'),
          '--color-chart-round1': theme('colors.chart.round1'),
          '--color-chart-round2': theme('colors.chart.round2'),
          '--color-chart-round3': theme('colors.chart.round3'),
          '--color-chart-grid': theme('colors.chart.grid'),
          '--color-chart-axis': theme('colors.chart.axis'),
        },
      });
    },
  ],
};
