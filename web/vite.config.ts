// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Default target predates top-level await, which @novnc/novnc's ESM
  // build uses -- es2022 is baseline-supported by every browser this
  // app already requires (native ES modules, CSS nesting, etc).
  build: {
    target: 'es2022',
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:9095',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:9095',
        ws: true,
      },
    },
  },
})
