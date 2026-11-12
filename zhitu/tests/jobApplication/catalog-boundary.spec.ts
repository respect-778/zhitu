import { expect, test } from '@playwright/test'
import path from 'node:path'

test('目录迁移后开发服务器仍拒绝服务端源码', async ({ request }) => {
  const root = path.resolve(import.meta.dirname, '../../..').replaceAll('\\', '/')
  for (const directory of ['backend/services/jobApplication/catalog', 'backend/node_modules/@knowvia/job-catalog']) {
    const response = await request.get(`/@fs/${root}/${directory}/src/storage/client.ts?raw`)
    expect([403, 404]).toContain(response.status())
    expect(await response.text()).not.toContain('createCatalogClient')
  }
  expect((await request.get('/src/api/jobApplication/catalogClient.ts')).status()).toBe(200)
})
