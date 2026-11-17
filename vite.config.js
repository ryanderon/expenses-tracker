import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
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

/**
 * Asks Google Fonts for only the Material Symbols the app uses. The full font
 * is ~325 KB and `display=block` hides every icon until it arrives; the subset
 * is ~11 KB.
 *
 * Icon names are found, not listed: every quoted string in src/ that is a
 * real icon name (scripts/material-symbols-names.txt, from Google's
 * codepoints file) goes in. A few ordinary words that happen to be icon names
 * ride along, which costs bytes, never a missing icon. Build only; dev keeps
 * the full font. If anything goes wrong the full font stays.
 */
function subsetIconFont() {
  const listSource = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return listSource(path)
    return /\.(jsx?|tsx?)$/.test(entry.name) ? [path] : []
  })

  return {
    name: 'subset-icon-font',
    apply: 'build',
    transformIndexHtml(html) {
      try {
        const known = new Set(readFileSync('scripts/material-symbols-names.txt', 'utf8').split('\n').filter(Boolean))
        const used = new Set()
        for (const file of listSource('src')) {
          for (const [, word] of readFileSync(file, 'utf8').matchAll(/['"`]([a-z][a-z0-9_]{1,40})['"`]/g)) {
            if (known.has(word)) used.add(word)
          }
        }
        if (used.size === 0) return html
        // Google requires the names sorted.
        const names = [...used].sort().join(',')
        return html.replace(
          /(family=Material\+Symbols\+Outlined:[^"&]*)(&display=)/,
          `$1&icon_names=${names}$2`
        )
      } catch {
        return html
      }
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), apiRoutes(), subsetIconFont()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
