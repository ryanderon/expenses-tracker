import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import quoteHandler from './api/quote.js'

/** Serves the Vercel functions in `api/` from the Vite dev and preview servers. */
function apiRoutes() {
  // Block body on purpose: a function returned from configureServer runs as a post hook.
  const mount = (server) => {
    server.middlewares.use('/api/quote', quoteHandler)
  }
  return { name: 'api-routes', configureServer: mount, configurePreviewServer: mount }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), apiRoutes()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
