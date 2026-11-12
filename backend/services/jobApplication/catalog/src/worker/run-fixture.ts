import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RunReportSchema, type Job } from '../../contracts/index.ts';
import { assertFixtureEnvironment, type FixtureScenario } from '../runtime/config.ts';
import { fixturePages } from './fixture.ts';

/** A fixed two-page in-memory self-check. No HTTP helper, browser, dataset, or database is used. */
export async function runFixture(scenario: FixtureScenario = 'normal') {
  assertFixtureEnvironment();
  const { BasicCrawler, Configuration, EventManager, RequestQueue, Log, LogLevel } = await import('@crawlee/basic');
  // Recheck immediately before Configuration can load cwd/crawlee.json.
  assertFixtureEnvironment();
  const config = new Configuration({
    persistStorage: false, purgeOnStart: false, memoryMbytes: 128,
    storageClientOptions: {
      persistStorage: false, writeMetadata: false,
      // MemoryStorage may look for existing files even when persistence is disabled.
      // A fresh uncreated namespace prevents reading the caller's default storage.
      localDataDirectory: join(tmpdir(), `knowvia-catalog-fixture-${randomUUID()}`),
    },
  });
  // The exported base is abstract in its typings. This empty subclass uses only
  // its lifecycle events, avoiding LocalEventManager's host/process inspection.
  class FixtureEvents extends EventManager {}
  const events = new FixtureEvents(config);
  config.useEventManager(events);
  const logger = new Log({ level: LogLevel.OFF });
  const startedAt = new Date().toISOString();
  const { source, pages } = fixturePages(startedAt);
  const queue = await RequestQueue.open(`fixture-${randomUUID()}`, { config });
  const jobs: Job[] = [];
  const attempts: Record<string, number> = {};
  let pagesRead = 0;
  let requestFailures = 0;
  const crawler = new BasicCrawler({
    requestQueue: queue, maxConcurrency: 1, minConcurrency: 1,
    maxRequestsPerCrawl: pages.length, maxRequestRetries: 1,
    requestHandlerTimeoutSecs: 5, useSessionPool: false, log: logger,
    statisticsOptions: { persistenceOptions: { enable: false } },
    autoscaledPoolOptions: { loggingIntervalSecs: null },
    async requestHandler({ request }) {
      const fixture = pages.find(page => page.key === request.uniqueKey);
      if (!fixture) throw new Error('Unexpected synthetic request.');
      attempts[fixture.key] = (attempts[fixture.key] ?? 0) + 1;
      if (fixture.key === 'fixture-page-2' &&
          (scenario === 'always-fail' || (scenario === 'retry-once' && request.retryCount === 0))) {
        throw new Error('Synthetic retry check.');
      }
      pagesRead++;
      jobs.push(fixture.job);
    },
    async failedRequestHandler() { requestFailures++; },
  }, config);
  try {
    await queue.addRequests(pages.map(page => ({ url: page.url, uniqueKey: page.key })));
    await crawler.run();
  } finally {
    // run() normally tears down its pool and events; these calls also cover early failures.
    await crawler.teardown();
    await events.close();
  }
  const complete = pagesRead === pages.length && requestFailures === 0;
  const report = RunReportSchema.parse({
    runId: `fixture-${randomUUID()}`, sourceId: source.sourceId, scopeKey: source.scopeKey,
    status: complete ? 'complete' : (pagesRead ? 'partial' : 'failed'),
    startedAt, finishedAt: new Date().toISOString(), pagesRead,
    recordsSeen: jobs.length, accepted: jobs.length, rejected: 0, duplicateIds: 0, requestFailures,
    excluded: 0, exclusions: [], reportedTotal: pages[0].page.reportedTotal,
    nextCursor: complete ? null : 'fixture-page-2', hasMore: !complete,
    coverageComplete: complete, stopReason: complete ? 'exhausted' : 'request_failed',
  });
  return { mode: 'fixture' as const, synthetic: true, persisted: false, source, jobs, report, attempts };
}
