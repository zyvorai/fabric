// Copyright 2026 Zyvor
// SPDX-License-Identifier: Apache-2.0

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/api': 'http://localhost:9095',
      '/ws': {
        target: 'ws://localhost:9095',
        ws: true,
      },
    },
  },
})
