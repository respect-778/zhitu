import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const mode = process.argv[2] || 'dev'
if (!['dev', 'build', 'start'].includes(mode))
  throw new Error('Use dev, build or start')

const webRoot = fileURLToPath(new URL('../apps/web/', import.meta.url))
const websiteUrl = process.env.INTERVIEW_WEBSITE_URL || 'http://localhost:5174'
const args = ['node_modules/next/dist/bin/next', mode]
if (mode !== 'start') args.push('--webpack')
if (mode !== 'build') args.push('--hostname', '127.0.0.1', '--port', '3001')

const child = spawn(process.execPath, args, {
  cwd: webRoot,
  stdio: 'inherit',
  env: {
    ...process.env,
    NEXT_PUBLIC_INTERVIEW_BASE_PATH: '/mock-interview',
    NEXT_PUBLIC_APP_URL: websiteUrl,
    NEXT_PUBLIC_SITE_URL: `${websiteUrl}/mock-interview`,
  },
})
child.on('error', (error) => {
  console.error(error.message)
  process.exitCode = 1
})
child.on('exit', (code) => {
  process.exitCode = code ?? 1
})
process.once('SIGINT', () => child.kill('SIGINT'))
process.once('SIGTERM', () => child.kill('SIGTERM'))
