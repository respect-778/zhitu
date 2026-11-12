import { realpathSync } from 'node:fs'
import path from 'node:path'
import type { Plugin } from 'vite'

// Vite's fs.allow/deny comparison is lexical. Resolve physical ancestors before
// serving so Windows short names, junctions and generated .map URLs cannot turn
// the workspace package link into a backend source download.
export function catalogFileBoundary(catalogRoot: string): Plugin {
  const comparable = (value: string) => {
    const normal = value.startsWith('\\\\?\\') ? value.slice(4) : value
    return process.platform === 'win32' ? normal.toLowerCase() : normal
  }
  const protectedRoot = comparable(realpathSync.native(catalogRoot))
  function isProtected(candidate: string): boolean {
    let ancestor = path.resolve(candidate)
    while (true) {
      try {
        const physical = comparable(realpathSync.native(ancestor))
        return physical === protectedRoot || physical.startsWith(protectedRoot + path.sep)
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code
        if (code !== 'ENOENT' && code !== 'ENOTDIR') return true
        const parent = path.dirname(ancestor)
        if (parent === ancestor) return false
        ancestor = parent
      }
    }
  }
  return {
    name: 'catalog-file-boundary',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const forbid = () => {
          response.statusCode = 403
          response.setHeader('Content-Type', 'text/plain; charset=utf-8')
          response.setHeader('Cache-Control', 'no-store')
          response.end('Forbidden')
        }
        let pathname: string
        let moduleId = false
        try {
          pathname = decodeURIComponent((request.url || '/').split(/[?#]/, 1)[0]).replaceAll('\\', '/')
          // Vite unwraps /@id/ before resolving modules. Apply that interpretation
          // before /@fs/ and alias checks too; reject excessive nested wrappers.
          for (let depth = 0; pathname.startsWith('/@id/'); depth++) {
            if (depth >= 8) throw new Error('Invalid path')
            pathname = pathname.slice(5); moduleId = true
          }
          if (pathname.includes('\0')) throw new Error('Invalid path')
        } catch {
          response.statusCode = 400; response.end('Invalid request'); return
        }
        const candidates: string[] = []
        if (pathname.startsWith('/@fs/')) candidates.push(pathname.slice(5))
        else {
          candidates.push(path.resolve(server.config.root, '.' + pathname))
          if (server.config.publicDir) candidates.push(path.resolve(server.config.publicDir, '.' + pathname))
          // Check the same configured aliases before Vite can rewrite a URL.
          for (const input of [pathname, pathname.slice(1)]) {
            for (const alias of server.config.resolve.alias) {
              const matches = typeof alias.find === 'string'
                ? input === alias.find || input.startsWith(alias.find + '/')
                : new RegExp(alias.find.source, alias.find.flags.replace(/[gy]/g, '')).test(input)
              if (matches) { candidates.push(input.replace(alias.find, alias.replacement)); break }
            }
          }
          if (moduleId && path.isAbsolute(pathname)) candidates.push(pathname)
        }
        if (candidates.some(isProtected)) {
          forbid()
          return
        }
        // Bare /@id/ package requests must use Vite's own resolver, otherwise
        // an npm package alias could bypass physical file checks. Resolution
        // reads metadata only: no module is loaded or executed here.
        if (moduleId && !pathname.startsWith('/@fs/')) {
          void server.environments.client.pluginContainer.resolveId(pathname).then(resolved => {
            const id = resolved?.id.split(/[?#]/, 1)[0]
            if (id && path.isAbsolute(id) && isProtected(id)) forbid()
            else next()
          }).catch(() => forbid())
          return
        }
        next()
      })
    },
  }
}
