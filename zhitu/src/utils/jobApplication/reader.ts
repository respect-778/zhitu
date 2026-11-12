import { bridge as extensionBridge } from '@/api/jobApplication/bridge';
import { cityCodes } from '@/utils/jobApplication/cities';
import { platformNames, platformJobId, type JobPlatform } from '@/utils/jobApplication/platforms';
import { loadJobCache, saveJobCache, type CachedJobSearch } from '@/utils/jobApplication/jobCache';
import { applyJobDetails, compareSalaryDescending, effectiveFilters, initialFilters, matchesJob, normalizeJob, sameQuery, sourceKeyword, type Filters, type Job } from '@/utils/jobApplication/model';
import { isAgentDevelopmentSearch, zhaopinKeyword } from '@/utils/jobApplication/jobKeywords';
import { compareJobTimeDescending } from '@/utils/jobApplication/jobTime';

export interface Catalogue {
  items: Job[]; total: number; fetched_total: number; query: Filters | null; revision: number; page: number; page_size: number;
}
export interface ReaderStatus {
  extension_installed: boolean; browser_running: boolean; busy: boolean; cities: string[]; query: Filters | null; revision: number;
  extension_outdated: boolean; extension_updating: boolean; details_busy: boolean; detail_message: string;
  rendered_metadata: boolean; resumable: boolean;
  cache_error: string; cache_saved_at: string;
  detail_counts: Record<Job['detail_state'], number>;
  run: { state: 'idle' | 'running' | 'done' | 'partial' | 'error'; message: string; found: number; raw_count: number; skipped_count: number;
    pages_read: number; next_page: number; stop_reason: 'page_limit' | 'source_end' | 'repeated' | 'error' | 'cancelled' | null };
}
export function createReader(platform: JobPlatform) {
  const sourceName = platformNames[platform];
  const openCommand = ({ boss: 'OPEN_BOSS', zhaopin: 'OPEN_ZHAOPIN', liepin: 'OPEN_LIEPIN' } as const)[platform];
  const emptyRun = (): ReaderStatus['run'] => ({ state: 'idle', message: '', found: 0, raw_count: 0, skipped_count: 0, pages_read: 0, next_page: 1, stop_reason: null });
  const status: Omit<ReaderStatus, 'resumable' | 'detail_counts'> = { extension_installed: false, browser_running: false, busy: false, cities: Object.keys(cityCodes), query: null, revision: 0, run: emptyRun(), extension_outdated: false, extension_updating: false, details_busy: false, detail_message: '', rendered_metadata: false, cache_error: '', cache_saved_at: '' };
  // The current task uses memory. Its latest results and cursor also live in browser IndexedDB.
  const rows = new Map<string, Job>();
  const seen = new Set<string>();
  // Missing graduation or keyword evidence is resolved before a candidate is shown.
  const pendingDetails = new Map<string, Job>();
  let sourceEnd: 'source_end' | 'repeated' | null = null;
  let prepared = false;
  let searchReady: boolean | undefined;
  const listBatchPages = 2;
  let generation = 0;
  let active = false;
  let readerEnabled = platform === 'boss';
  function restoreSnapshot(saved: CachedJobSearch) {
    rows.clear(); pendingDetails.clear(); seen.clear();
    saved.jobs.forEach(job => placeCandidate(job, saved.query));
    saved.pending.forEach(job => placeCandidate(job, saved.query));
    saved.seen.forEach(id => seen.add(id));
    sourceEnd = saved.sourceEnd;
    status.query = saved.query;
    status.run = { ...saved.run, found: rows.size };
    if (status.run.state === 'running') {
      status.run.state = 'partial'; status.run.stop_reason = 'cancelled';
    }
    status.run.message = '已恢复浏览器缓存，可继续查看岗位。';
    status.busy = false; status.details_busy = false; status.detail_message = '';
    prepared = false;
    status.cache_saved_at = saved.savedAt;
    status.revision++;
  }
  const cacheLoaded = loadJobCache(platform).then(saved => {
    if (!saved || !cityCodes[saved.query.city]) return;
    restoreSnapshot(saved);
  }).catch(() => { status.cache_error = '浏览器岗位缓存读取失败，仍可重新搜索。'; });
  async function restoreCachedJobs(): Promise<void> { await cacheLoaded; }
  let cacheWrite: Promise<void> = Promise.resolve();
  function persistSearch(): Promise<void> {
    if (!status.query) return Promise.resolve();
    if (!seen.size && !rows.size && !pendingDetails.size && ['error', 'cancelled'].includes(status.run.stop_reason || '')) return Promise.resolve();
    const saved: CachedJobSearch = structuredClone({ version: 1, savedAt: new Date().toISOString(),
      query: status.query, jobs: [...rows.values()], pending: [...pendingDetails.values()],
      seen: [...seen], sourceEnd, run: status.run });
    cacheWrite = cacheWrite.then(() => saveJobCache(saved, platform)).then(() => {
      status.cache_saved_at = saved.savedAt; status.cache_error = '';
    }).catch(() => { status.cache_error = '浏览器未能保存岗位缓存，请检查浏览器存储空间或权限。'; });
    return cacheWrite;
  }
  // The page owns reader lifetime; switching sources pauses work without erasing rows.
  function bridge<T>(...args: Parameters<typeof extensionBridge>): Promise<T> {
    if (!readerEnabled) return Promise.reject(new Error('已停止读取。'));
    const [command, payload] = args;
    return extensionBridge<T>(command, platform === 'boss' ? payload : { ...(payload as Record<string, unknown> || {}), platform });
  }
  function setReaderEnabled(enabled: boolean) {
    if (readerEnabled === enabled) return;
    readerEnabled = enabled;
    if (!enabled) {
      if (active || status.busy) void request('/collect/stop');
      else generation++;
    }
  }
  let extensionVersion = '';
  let lastPing = 0;
  let pingTask: Promise<void> | undefined;
  let delayTimer: ReturnType<typeof setTimeout> | undefined;
  let wake: (() => void) | undefined;
  function waitBetweenReads(minimumMs: number, maximumMs: number): Promise<void> {
    const delayMs = minimumMs + Math.floor(Math.random() * (maximumMs - minimumMs + 1));
    return new Promise(resolve => {
      wake = resolve;
      delayTimer = setTimeout(resolve, delayMs);
    });
  }
  function pauseForJobNavigation() {
    if (active || status.busy || status.details_busy) {
      void request('/collect/stop');
      status.run.message = '已暂停后台读取，当前岗位保留。';
    }
    prepared = false;
  }
  const degreeCodes: Record<string, string> = { 大专: '202', 本科: '203', 硕士: '204', 博士: '205' };
  // This exact pre-0.4 error means its in-memory tab binding is missing, not that
  // BOSS rejected authentication. Never retry login/verification/network errors.
  const legacyMissingTab = `请先点击「连接 ${sourceName}」，在当前浏览器完成登录。`;
  function readError(error: unknown) {
    const message = error instanceof Error ? error.message : '读取未完成。';
    return message === legacyMissingTab ? `${sourceName} 搜索连接已中断，请确认 ${sourceName} 搜索标签页仍打开后重新搜索。` : message;
  }
  function placeCandidate(job: Job, query: Filters) {
    if (matchesJob(job, query)) { rows.set(job.id, job); return; }
    const needsGraduation = Boolean(query.graduate_year && !job.graduate_year);
    const needsKeyword = platform !== 'boss' && isAgentDevelopmentSearch(query.keyword) && !job.description && job.detail_state !== 'complete';
    if ((needsGraduation || needsKeyword) && matchesJob(job, { ...query,
      graduate_year: needsGraduation ? '' : query.graduate_year, keyword: needsKeyword ? '' : query.keyword })) pendingDetails.set(job.id, job);
  }
  const detailJobs = () => [...rows.values(), ...pendingDetails.values()];
  const canResume = () => Boolean(status.query && !active && (!sourceEnd || detailJobs().some(job => job.detail_state !== 'complete')));
  const snapshot = (): ReaderStatus => {
    const counts = { unread: 0, reading: 0, complete: 0, partial: 0, error: 0 };
    for (const job of detailJobs()) counts[job.detail_state]++;
    return structuredClone({ ...status, resumable: canResume(), detail_counts: counts });
  };
  async function ping(force = false) {
    if (!readerEnabled) return;
    if (pingTask) return pingTask;
    if (!force && Date.now() - lastPing < 4000) return;
    pingTask = (async () => {
      try {
        const result = await bridge<{ installed: boolean; browser_running: boolean; version?: string; updating?: boolean; rendered_metadata?: boolean; search_ready?: boolean; platforms?: string[] }>('PING', { busy: active });
        status.extension_installed = result.installed;
        status.browser_running = result.browser_running;
        status.extension_outdated = Boolean(result.version && /^0\.[012]\./.test(result.version)) || (platform !== 'boss' && !result.platforms?.includes(platform));
        status.extension_updating = Boolean(result.updating);
        status.rendered_metadata = Boolean(result.rendered_metadata);
        searchReady = result.search_ready;
        extensionVersion = result.version || '';
      } catch { status.extension_installed = false; status.browser_running = false; }
      finally { lastPing = Date.now(); pingTask = undefined; }
    })();
    return pingTask;
  }
  async function enrich(ids: string[], token: number) {
    status.details_busy = true;
    let completed = 0;
    try {
      for (const id of ids) {
        if (generation !== token) return false;
        const job = rows.get(id) || pendingDetails.get(id);
        if (!job) continue;
        const target = rows.has(id) ? rows : pendingDetails;
        target.set(id, { ...job, detail_state: 'reading' }); status.revision++;
        status.detail_message = `正在自动完善岗位详情 ${completed + 1} / ${ids.length}，可先浏览已显示的岗位…`;
        let updated = job;
        try {
          const url = new URL(job.url);
          const params = {
            jobId: platformJobId(url.href, platform), securityId: job.detail_security_id,
            needsGraduation: !job.graduate_year, needsDeadline: !job.deadline,
            ...(platform !== 'boss' ? { url: job.url } : {}),
          };
          const data = await bridge<Record<string, unknown>>('FETCH_DETAIL', params);
          updated = applyJobDetails(job, data);
          if (generation === token && !updated.graduate_year && status.rendered_metadata) {
            const metadata = await bridge<Record<string, unknown>>('READ_METADATA', params);
            const fields = Object.fromEntries(Object.entries(metadata).filter(([, value]) => value !== '' && value !== undefined));
            updated = applyJobDetails(updated, { ...data, ...fields, detailWarning: metadata.detailWarning });
          }
        }
        catch (error) {
          if (generation !== token) return false;
          const message = error instanceof Error ? error.message : '详情读取未完成。';
          target.set(id, { ...updated, detail_state: 'error', detail_error: message }); status.revision++;
          await persistSearch();
          throw new Error(message);
        }
        if (generation !== token) return false;
        if (!status.query || matchesJob(updated, status.query)) rows.set(id, updated);
        else rows.delete(id);
        pendingDetails.delete(id);
        completed++; status.run.found = rows.size; status.revision++;
        await persistSearch();
        if (generation !== token) return false;
        // A valid job response may lack the optional HTML metadata. Keep it and
        // continue; rejected requests still throw above.
        if (completed < ids.length) await waitBetweenReads(1000, 2000);
      }
      const partialCount = [...rows.values()].filter(job => job.detail_state === 'partial').length;
      status.detail_message = partialCount
        ? `已读取 ${rows.size} 个岗位正文。其中 ${partialCount} 个岗位的补充信息页未能读取，已保留可用信息，缺失字段已标注。`
        : `全部 ${rows.size} 个岗位详情已自动读取。未找到的字段已标注。`;
      return true;
    } catch (error) {
      if (generation === token) {
        status.run.state = 'partial';
        status.detail_message = `自动补全已暂停（本轮完成 ${completed} / ${ids.length}），${error instanceof Error ? error.message : '详情读取未完成。'} 已保留读取结果。`;
      }
      return false;
    } finally {
      if (generation === token) status.details_busy = false;
    }
  }
  async function read(query: Filters, maxPages: number, token: number, continued: boolean, retryPartial: boolean) {
    const current = () => generation === token;
    let committed = continued;
    const params = { keyword: platform === 'boss' ? sourceKeyword(query) : zhaopinKeyword(query.keyword), city: platform === 'boss' ? cityCodes[query.city] : query.city, degree: platform === 'boss' ? degreeCodes[query.education] || '' : query.education || '', job_type: query.job_type, page: 1 };
    let recovered = false;
    async function sourceRequest<T>(command: 'PREPARE' | 'FETCH_PAGE', page = 1): Promise<T> {
      const input = { ...params, page };
      try { return await bridge<T>(command, input); }
      catch (error) {
        if (!current() || recovered || !/^0\.3\./.test(extensionVersion)
          || !(error instanceof Error) || error.message !== legacyMissingTab) throw error;
        recovered = true;
        status.run.message = `正在恢复 ${sourceName} 搜索连接，已读取的结果会保留…`;
        await bridge(openCommand);
        if (!current()) throw new Error('已停止读取。');
        if (command !== 'PREPARE') {
          await bridge('PREPARE', input);
          if (!current()) throw new Error('已停止读取。');
        }
        return bridge<T>(command, input);
      }
    }
    async function completePending(includePartial = false) {
      // Partial HTML metadata is terminal for this search. Do not retry the same
      // optional page on every pagination step or when continuing a batch.
      const pending = detailJobs().filter(job => job.detail_state !== 'complete' && (includePartial || job.detail_state !== 'partial'));
      if (query.sort === 'salary_desc') pending.sort(compareSalaryDescending);
      if (query.sort === 'company') pending.sort((a, b) => a.company.localeCompare(b.company, 'zh-CN'));
      if (query.sort === 'newest') pending.sort(compareJobTimeDescending);
      if (!pending.length || await enrich(pending.map(job => job.id), token)) return current();
      if (current()) {
        status.run.stop_reason = 'error'; status.run.state = rows.size ? 'partial' : 'error';
        status.run.message = `本轮列表已读取 ${status.run.pages_read} 页，详情补全已暂停。已保留 ${rows.size} 个符合条件的岗位。`;
      }
      return false;
    }
    function finish() {
      status.run.stop_reason = sourceEnd || 'page_limit';
      const incomplete = detailJobs().some(job => job.detail_state !== 'complete');
      status.run.state = sourceEnd === 'source_end' && !status.run.skipped_count && !incomplete ? 'done' : 'partial';
      if (sourceEnd === 'source_end') {
        status.run.message = `已读到 ${sourceName} 本次搜索返回的末页，共找到 ${rows.size} 个符合条件的岗位。`;
      } else if (sourceEnd === 'repeated') {
        status.run.message = `${sourceName} 未返回新岗位，已停止。当前结果可查看，无法确认已读完。`;
      } else {
        status.run.message = `本轮已完成，共找到 ${rows.size} 个符合条件的岗位。可继续读取后续页。`;
      }
    }
    try {
      if (!prepared || (continued && searchReady === false)) { await sourceRequest('PREPARE'); if (current()) prepared = true; }
      if (!current()) return;
      if (continued && !await completePending(retryPartial)) return;
      if (continued && sourceEnd) { finish(); return; }
      const start = continued ? status.run.next_page : 1;
      for (let page = start; page < start + maxPages; page++) {
        if (!current()) return;
        status.run.message = `正在读取第 ${page} 页…`;
        const payload = await sourceRequest<{ jobs: unknown[]; hasMore: boolean | null }>('FETCH_PAGE', page);
        if (!current()) return;
        if (!Array.isArray(payload.jobs)) throw new Error('岗位返回格式变化，已停止读取。');
        // A malformed entry must not discard the valid jobs returned alongside it.
        // Never manufacture a homepage link for a job whose identity is missing.
        const normalized = payload.jobs.map(normalizeJob).filter((job): job is Job => job !== null && (job.platform || 'boss') === platform);
        if (payload.jobs.length && !normalized.length) throw new Error(`第 ${page} 页没有可用的岗位详情链接，已暂停读取，请稍后重新搜索。`);
        // Commit the new query only after the source returned a usable first page.
        // Until then, the previous results and cursor remain available.
        if (!committed) {
          rows.clear(); seen.clear(); pendingDetails.clear(); sourceEnd = null;
          status.query = query; status.run = emptyRun(); status.run.state = 'running';
          committed = true;
        }
        status.run.raw_count += payload.jobs.length;
        status.run.skipped_count += payload.jobs.length - normalized.length;
        let newCount = 0;
        for (const job of normalized) {
          // Overlapping source pages must not discard details already read in this search.
          if (seen.has(job.id)) continue;
          seen.add(job.id); newCount++;
          placeCandidate(job, query);
        }
        status.revision++;
        status.run.found = rows.size;
        status.run.pages_read++;
        status.run.next_page = page + 1;
        if (page === start + maxPages - 1 && payload.hasMore !== false && payload.jobs.length) {
          status.run.stop_reason = 'page_limit';
        }
        if ((payload.jobs.length > 0 && newCount === 0) || (!payload.jobs.length && payload.hasMore === true)) {
          sourceEnd = 'repeated';
        } else if (payload.hasMore === false || !payload.jobs.length) {
          sourceEnd = 'source_end';
        }
        await persistSearch();
        if (!current()) return;
        if (sourceEnd) break;
        if ((page - start + 1) % listBatchPages === 0 && !await completePending()) return;
        if (page < start + maxPages - 1) await waitBetweenReads(2000, 3000);
      }
      if (!current()) return;
      status.run.stop_reason ||= 'page_limit';
      status.run.message = `本轮列表已读取 ${status.run.pages_read} 页，正在自动补全缺失信息，可先浏览已显示的岗位。`;
      if (!await completePending()) return;
      finish();
    } catch (error) {
      if (!current()) return;
      if (!committed) prepared = false;
      status.run.stop_reason = 'error'; status.run.state = rows.size ? 'partial' : 'error';
      status.run.message = `${!committed && status.query ? `新查询“${query.keyword}”未完成。` : ''}${readError(error)}${rows.size ? ` 已保留 ${rows.size} 个符合条件的岗位。` : ' 本次尚未找到符合条件的岗位，搜索未完成。'}`;
      const unread = [...rows.values(), ...pendingDetails.values()].filter(job => job.detail_state === 'unread').length;
      if (unread) status.detail_message = `列表读取中断，${unread} 个岗位的详情尚未读取，缺失的毕业时间和截止日期尚未核实。`;
    } finally {
      active = false;
      if (current()) { status.busy = false; status.details_busy = false; }
      await persistSearch();
      if (current()) void ping(true);
    }
  }
  // Local interface for UI orchestration; it never issues a backend HTTP request.
  async function request<T>(path: string, body?: unknown): Promise<T> {
    if (path !== '/collect/stop') await cacheLoaded;
    if (path === '/status') { await ping(Boolean((body as { refresh?: boolean } | undefined)?.refresh)); return snapshot() as T; }
    if (path === '/browser/start') {
      const token = generation;
      await ping(true);
      if (!readerEnabled || generation !== token) throw new Error('已停止读取。');
      if (!status.extension_installed) throw new Error('请先在当前 Chrome 或 Edge 浏览器安装 Knowvia 岗位读取助手，再刷新本页。');
      const result = await bridge(openCommand);
      status.browser_running = true;
      return result as T;
    }
    if (path === '/collect/stop') {
      generation++; clearTimeout(delayTimer); wake?.();
      for (const [id, job] of rows) if (job.detail_state === 'reading') rows.set(id, { ...job, detail_state: 'unread' });
      for (const [id, job] of pendingDetails) if (job.detail_state === 'reading') pendingDetails.set(id, { ...job, detail_state: 'unread' });
      status.revision++;
      if (status.details_busy) {
        status.busy = false; status.details_busy = false; status.detail_message = '已停止补全，已读详情保留在当前页面。';
        status.run.state = 'partial';
        if (status.run.stop_reason !== 'page_limit') status.run.stop_reason = 'cancelled';
        status.run.message = '已停止读取，已找到的岗位保留在当前页面。';
        await persistSearch();
        return snapshot() as T;
      }
      status.busy = false; status.run.state = 'partial'; status.run.stop_reason = 'cancelled';
      status.run.message = '已停止读取，已找到的岗位保留在当前页面。';
      await persistSearch();
      return snapshot() as T;
    }
    if (path === '/collect') {
      if (!readerEnabled) throw new Error('已停止读取。');
      if (active) throw new Error('上一轮读取正在结束，请稍后重试。');
      const input = body as Filters & { max_pages: number; continue_search: boolean; refresh?: boolean };
      const query = effectiveFilters(Object.fromEntries(Object.keys(initialFilters).map(key => [key, String(input[key as keyof Filters] ?? initialFilters[key as keyof Filters]).trim()])) as unknown as Filters);
      if (!query.keyword || query.keyword.length > 100 || !cityCodes[query.city]) throw new Error('请输入岗位关键词并选择工作城市。');
      if (!Number.isInteger(input.max_pages) || input.max_pages < 1 || input.max_pages > 50) throw new Error('读取页数应为 1–50 页。');
      if ([query.salary_min, query.salary_max].some(value => value && (!Number.isFinite(Number(value)) || Number(value) < 0))
        || (query.salary_min && query.salary_max && Number(query.salary_min) > Number(query.salary_max))) throw new Error('请检查薪资上下限。');
      const retryPartial = status.run.stop_reason !== 'page_limit';
      if (input.continue_search && (!status.query || !sameQuery(status.query, query) || !canResume())) throw new Error('条件已变化或没有待恢复的任务，请重新搜索。');
      // Reserve the task before the first await, including simultaneous submissions.
      active = true;
      const token = ++generation;
      try {
        if (!input.continue_search && !input.refresh) {
          let saved: CachedJobSearch | null = null;
          try { saved = await loadJobCache(platform, query); }
          catch { status.cache_error = '浏览器缓存读取失败，将尝试读取平台岗位。'; }
          if (generation !== token) throw new Error('已停止读取。');
          if (saved) {
            restoreSnapshot(saved);
            status.query = query;
            status.run.message = '已使用浏览器缓存。需要更新岗位时，可点击“读取最新”。';
            active = false;
            await persistSearch();
            return snapshot() as T;
          }
        }
        await ping(true);
        if (generation !== token) throw new Error('已停止读取。');
        if (status.extension_outdated) throw new Error('当前浏览器助手版本暂不兼容，需由维护人员同步版本后使用。');
        if (status.extension_updating) throw new Error('浏览器助手正在更新，完成后会自动重连。请稍后搜索。');
        if (!status.extension_installed) throw new Error('请先在当前浏览器安装 Knowvia 岗位读取助手。');
        // Older local helpers only know tabs they created. Recover that binding here
        // automatically; the user does not need another Connect click or helper update.
        if (!status.browser_running && (!extensionVersion || /^0\.[0123]\./.test(extensionVersion))) {
          await bridge(openCommand);
          status.browser_running = true;
        }
        if (!status.browser_running) throw new Error(`请先点击“连接 ${sourceName}”，在当前浏览器打开并登录 ${sourceName} 后再读取。`);
        if (generation !== token) throw new Error('已停止读取。');
        if (!input.continue_search) {
          prepared = false;
          status.revision++; status.detail_message = '';
        }
        status.busy = true; status.details_busy = false; status.detail_message = ''; status.run.state = 'running'; status.run.stop_reason = null;
        status.run.message = `正在打开当前浏览器中的 ${sourceName} 搜索结果…`;
        void read(query, input.max_pages, token, input.continue_search, retryPartial);
        return snapshot() as T;
      } catch (error) {
        active = false;
        if (generation === token) void ping(true);
        throw error;
      }
    }
    throw new Error('不支持此操作。');
  }
  function sessionJobs(): Job[] { return structuredClone([...rows.values()]); }
  async function listJobs(filters: Filters, page: number): Promise<Catalogue> {
    await cacheLoaded;
    const items = [...rows.values()];
    if (filters.sort === 'salary_desc') items.sort(compareSalaryDescending);
    if (filters.sort === 'company') items.sort((a, b) => a.company.localeCompare(b.company, 'zh-CN'));
    if (filters.sort === 'newest') items.sort(compareJobTimeDescending);
    return { items: items.slice((page - 1) * 20, page * 20), total: items.length, fetched_total: seen.size,
      query: status.query, revision: status.revision, page, page_size: 20 };
  }

  return { request, listJobs, sessionJobs, restoreCachedJobs, setReaderEnabled, pauseForJobNavigation };
}
