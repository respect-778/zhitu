import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertFixtureEnvironment } from '../src/runtime/config.ts';

test('Crawlee glob filtering remains compatible with the patched minimatch dependency', async () => {
  assertFixtureEnvironment();
  const { createRequests } = await import('@crawlee/basic');
  const requests = createRequests([
    'https://catalog.example.invalid/jobs/Engineering',
    'https://catalog.example.invalid/JOBS/Design',
    'https://catalog.example.invalid/jobs/private/Internal',
    'https://catalog.example.invalid/news/Announcement',
    'https://other.example.invalid/jobs/Outside',
  ], [{ glob: 'https://catalog.example.invalid/jobs/**' }], [
    { glob: 'https://catalog.example.invalid/jobs/PRIVATE/**' },
  ]);
  assert.deepEqual(requests.map(request => request.url), [
    'https://catalog.example.invalid/jobs/Engineering',
    'https://catalog.example.invalid/JOBS/Design',
  ]);
  for (const { pattern, included, excluded } of [
    { pattern: '{Engineering,Design}', included: 'Engineering', excluded: 'Operations' },
    { pattern: '@(Engineering|Design)', included: 'Design', excluded: 'DesignArchive' },
  ]) {
    const baseUrl = 'https://catalog.example.invalid/jobs/';
    const matched = createRequests([`${baseUrl}${included}`, `${baseUrl}${excluded}`], [
      { glob: `${baseUrl}${pattern}` },
    ]);
    assert.deepEqual(matched.map(request => request.url), [`${baseUrl}${included}`], pattern);
  }
});
