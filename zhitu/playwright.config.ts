import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/jobApplication',
  tsconfig: './tsconfig.app.json',
  workers: 1,
  timeout: 45_000,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:5297', channel: process.platform === 'win32' ? 'msedge' : undefined, headless: true },
  webServer: { command: 'npm run dev -- --host 127.0.0.1 --port 5297', url: 'http://127.0.0.1:5297', env: { VITE_BASE_URL: '/api' }, reuseExistingServer: false },
})
