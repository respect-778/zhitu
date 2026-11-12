import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { ListPageSchema, RunReportSchema, type Exclusion, type Job, type ListPage, type StopReason } from '../../contracts/index.ts';
import { readTencentList, readTencentPost, readTencentDetail, postIdentity, tencentListUrl, tencentDetailApiUrl,
  tencentDetailUrl, TENCENT_PARSER, TENCENT_EXCLUSION, TencentParseError, type TencentPost } from '../adapters/tencent.ts';
import { createControlledJsonGetter, type JsonGetter } from '../http/controlled-get.ts';
import { loadTencentSource } from '../config/sources.ts';
import { assertFixtureEnvironment, RuntimeConfigError } from '../runtime/config.ts';

export interface TencentRunOptions { maxPages: number; pageSize: number; maxDetails: number; verifyLive?: boolean }
export function checkTencentOptions(options: TencentRunOptions): void {
  for (const [value, maximum] of [[options.maxPages, 1000], [options.pageSize, 100], [options.maxDetails, 100000]]) {
    if (!Number.isSafeInteger(value) || value < 1 || value > maximum) throw new RuntimeConfigError('TENCENT_LIMIT_INVALID', 'Tencent verification limits are invalid.');
  }
  // Every observed native record must be hydrated or explicitly rejected. Refuse
  // a configuration that could silently spend the detail budget mid-page.
  if (options.maxDetails < options.maxPages * options.pageSize) {
    throw new RuntimeConfigError('TENCENT_DETAIL_BUDGET', 'Detail budget must cover every possible record in the selected pages.');
  }
  if (options.verifyLive && (options.maxPages > 10 || options.pageSize > 25 || options.maxDetails > 250)) {
    throw new RuntimeConfigError('TENCENT_VERIFY_LIMIT', 'Live sampling is limited to 10 pages, 25 rows per page and 250 details.');
  }
}

/** No storage calls. An injected getter always marks the result synthetic. */
export async function runTencent(options: TencentRunOptions, injectedGetter?: JsonGetter) {
  checkTencentOptions(options);
  assertFixtureEnvironment();
  const source = await loadTencentSource();
  if (!source.enabled && !options.verifyLive && !injectedGetter) {
    throw new RuntimeConfigError('SOURCE_DISABLED', 'This source requires explicit bounded live verification.');
  }
  const getJson = injectedGetter ?? createControlledJsonGetter({ allowedHosts: source.allowedHosts });
  let nextRequestAt = 0;
  const { BasicCrawler, Configuration, EventManager, RequestQueue, Log, LogLevel } = await import('@crawlee/basic');
  assertFixtureEnvironment();
  const config = new Configuration({
    persistStorage: false, purgeOnStart: false, memoryMbytes: 128,
    storageClientOptions: { persistStorage: false, writeMetadata: false,
      localDataDirectory: join(tmpdir(), `knowvia-catalog-tencent-${randomUUID()}`) },
  });
  class SourceEvents extends EventManager {}
  const events = new SourceEvents(config);
  config.useEventManager(events);
  const queue = await RequestQueue.open(`tencent-${randomUUID()}`, { config });
  const startedAt = new Date().toISOString();
  const jobs: Job[] = [];
  const pages: ListPage[] = [];
  const exclusions: Exclusion[] = [];
  const seen = new Set<string>();
  const pageSignatures = new Set<string>();
  const pendingDetails = new Map<string, TencentPost>();
  const attempts: Record<string, number> = {};
  let pagesRead = 0, recordsSeen = 0, rejected = 0, duplicateIds = 0, excluded = 0, requestFailures = 0;
  let reportedTotal: number | null = null;
  let hasMore: boolean | null = null;
  let nextCursor: string | null = null;
  let stop: StopReason | null = null;
  const reasons: StopReason[] = [];
  const remember = (reason: StopReason) => { if (!reasons.includes(reason)) reasons.push(reason); };
  const crawler = new BasicCrawler({
    requestQueue: queue, maxConcurrency: 1, minConcurrency: 1,
    maxRequestsPerCrawl: options.maxPages + options.maxDetails, maxRequestRetries: 1,
    requestHandlerTimeoutSecs: 40, useSessionPool: false, log: new Log({ level: LogLevel.OFF }),
    statisticsOptions: { persistenceOptions: { enable: false } },
    autoscaledPoolOptions: { loggingIntervalSecs: null },
    async requestHandler({ request }) {
      attempts[request.uniqueKey] = (attempts[request.uniqueKey] ?? 0) + 1;
      // Only fetching can throw into Crawlee's retry loop. Once accounting begins
      // the handler never retries and counts the same page/record twice.
      if (!injectedGetter) {
        await delay(Math.max(0, nextRequestAt - Date.now()));
        nextRequestAt = Date.now() + 1000;
      }
      const raw = await getJson(request.url);
      request.noRetry = true;
      const observedAt = new Date().toISOString();
      if (request.uniqueKey.startsWith('detail:')) {
        const id = request.uniqueKey.slice(7);
        const post = pendingDetails.get(id);
        if (!post) throw new Error('TENCENT_QUEUE_INVALID');
        pendingDetails.delete(id);
        try { jobs.push(readTencentDetail(raw, post, source, observedAt)); }
        catch { rejected++; remember('parse_failed'); }
        return;
      }
      const pageIndex = Number(request.uniqueKey.slice(5));
      let list: ReturnType<typeof readTencentList>;
      try { list = readTencentList(raw, options.pageSize); }
      catch { remember('parse_failed'); stop = 'parse_failed'; hasMore = null; nextCursor = null; return; }
      pagesRead++;
      if (reportedTotal === null) reportedTotal = list.total;
      else if (reportedTotal !== list.total) { remember('total_mismatch'); stop = 'total_mismatch'; }
      const items: ListPage['items'] = [];
      const pageExclusions: Exclusion[] = [];
      let pageRejected = 0, pageDuplicates = 0;
      const signature = list.posts.map((post, index) => { try { return postIdentity(post); } catch { return `invalid:${index}`; } }).join(',');
      if (list.posts.length && pageSignatures.has(signature)) { remember('repeated_page'); stop = 'repeated_page'; }
      pageSignatures.add(signature);
      for (const [index, rawPost] of list.posts.entries()) {
        recordsSeen++;
        let post: TencentPost;
        try {
          const id = postIdentity(rawPost);
          if (seen.has(id)) { duplicateIds++; pageDuplicates++; remember('repeated_page'); continue; }
          seen.add(id);
          post = readTencentPost(rawPost);
        } catch { rejected++; pageRejected++; remember('parse_failed'); continue; }
        if (post.source === 4) {
          excluded++;
          const exclusion: Exclusion = { count: 1, reason: 'outside_scope', ruleId: TENCENT_EXCLUSION,
            evidence: { sourceUrl: request.url, observedAt, parserVersion: TENCENT_PARSER,
              locator: `$.Data.Posts[${index}].SourceID=4;PostId=${post.id}` } };
          pageExclusions.push(exclusion); exclusions.push(exclusion);
          continue;
        }
        items.push({ sourceId: source.sourceId, sourceJobId: post.id, detailUrl: tencentDetailUrl(post.id) });
        pendingDetails.set(post.id, post);
      }
      const offset = (pageIndex - 1) * options.pageSize;
      const expected = Math.max(0, Math.min(options.pageSize, list.total - offset));
      if (list.posts.length !== expected || recordsSeen > list.total) { remember('total_mismatch'); stop = 'total_mismatch'; }
      if (pageDuplicates) stop = 'repeated_page';
      if (pageRejected && !stop) stop = 'parse_failed';
      const reachedEnd = offset + list.posts.length === list.total;
      hasMore = stop ? null : !reachedEnd;
      nextCursor = hasMore ? String(pageIndex + 1) : null;
      if (!stop && hasMore && pageIndex >= options.maxPages) stop = 'max_pages';
      const reason: StopReason = stop ?? (reachedEnd ? 'exhausted' : 'more_pages');
      // If the source reports fewer rows than the current page contains, no
      // valid ListPage exists. Keep its raw total in the run and reject coverage.
      if (items.length + pageExclusions.length <= list.total) {
        pages.push(ListPageSchema.parse({
          sourceId: source.sourceId, scopeKey: source.scopeKey, items,
          excluded: pageExclusions.length, exclusions: pageExclusions, reportedTotal: list.total,
          nextCursor, hasMore, completeness: reason === 'exhausted' ? 'complete' : 'partial', stopReason: reason,
        }));
      }
      // Add detail work before the next page; single concurrency also bounds
      // source load. Details are fetched again in every new run.
      await queue.addRequests(items.map(item => ({ url: tencentDetailApiUrl(item.sourceJobId), uniqueKey: `detail:${item.sourceJobId}` })));
      if (!stop && !reachedEnd) {
        await queue.addRequest({ url: tencentListUrl(pageIndex + 1, options.pageSize), uniqueKey: `page:${pageIndex + 1}` });
      }
    },
    async failedRequestHandler({ request }, error) {
      if (request.uniqueKey.startsWith('detail:')) {
        if (pendingDetails.delete(request.uniqueKey.slice(7))) rejected++;
      } else { hasMore = true; nextCursor = request.uniqueKey.slice(5); }
      requestFailures++;
      remember(error instanceof TencentParseError ? 'parse_failed' : 'request_failed');
    },
  }, config);
  try {
    await queue.addRequest({ url: tencentListUrl(1, options.pageSize), uniqueKey: 'page:1' });
    await crawler.run();
  } finally { await crawler.teardown(); await events.close(); }
  if (pendingDetails.size) { rejected += pendingDetails.size; pendingDetails.clear(); remember('request_failed'); }
  // No source job is closed here, especially when coverage is partial.
  const reason = reasons.find(value => value === 'repeated_page') ?? reasons.find(value => value === 'total_mismatch') ??
    reasons.find(value => value === 'parse_failed') ?? reasons.find(value => value === 'request_failed') ?? stop;
  const complete = reason === null && hasMore === false && reportedTotal !== null && jobs.length + excluded === reportedTotal;
  const report = RunReportSchema.parse({
    runId: `tencent-${randomUUID()}`, sourceId: source.sourceId, scopeKey: source.scopeKey,
    status: complete ? 'complete' : (pagesRead > 0 ? 'partial' : 'failed'), startedAt, finishedAt: new Date().toISOString(),
    pagesRead, recordsSeen, accepted: jobs.length, rejected, duplicateIds, requestFailures,
    excluded, exclusions, reportedTotal, nextCursor, hasMore, coverageComplete: complete,
    stopReason: complete ? 'exhausted' : (reason ?? 'total_mismatch'),
  });
  return { mode: 'tencent' as const, synthetic: Boolean(injectedGetter), persisted: false, source, jobs, pages, report, attempts };
}
