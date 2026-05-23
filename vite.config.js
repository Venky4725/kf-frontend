import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            // Keep heavy charts separate as they are only used in dashboards
            if (id.includes('recharts') || id.includes('d3')) {
              return 'vendor-charts'
            }
            // Group all other dependencies to prevent circular chunking issues
            return 'vendor'
          }
          // Logical module splitting for the application code
          if (id.includes('/pages/admin/')) {
            return 'admin-module'
          }
          if (id.includes('/pages/tl/')) {
            return 'tl-module'
          }
          if (id.includes('/pages/intern/')) {
            return 'intern-module'
          }
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})

