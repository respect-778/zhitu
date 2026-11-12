// Runs inside the ordinary Liepin tab without attaching a browser debugger.
// Only public recruitment fields are returned to the website.
export async function readLiepinPage(input) {
  const text = value => typeof value === 'string' ? value.trim() : '';
  const body = document.body?.innerText || '';
  if (location.origin !== 'https://www.liepin.com') return { error: '猎聘页面已跳转，请检查猎聘标签页后恢复读取。' };
  if (/请完成安全验证|访问过于频繁|访问异常|操作过于频繁|拖动滑块/.test(body)) return { error: '猎聘要求验证或限制访问，已暂停读取，请查看猎聘页面。' };
  if (input.operation === 'detail') {
    if (location.pathname !== new URL(input.url).pathname) return { error: '猎聘详情已跳转，未读取到这个岗位。' };
    const section = document.querySelector('[data-selector="job-intro-content"], .job-description, .job-description-content, .content.content-word');
    if (!section || !document.querySelector('.job-title-box, h1')) return { pending: true, stage: '岗位详情正文尚未加载' };
    if (/登录后查看|登录查看完整/.test(section.innerText)) return { error: '猎聘详情需要登录，请完成登录后恢复读取。' };
    const dates = {};
    for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
      let parsed;
      try { parsed = JSON.parse(script.textContent); } catch { continue; }
      const nodes = (Array.isArray(parsed) ? parsed : [parsed]).flatMap(node => node?.['@graph'] || [node]);
      for (const node of nodes) {
        if (node?.['@type'] !== 'JobPosting') continue;
        const identity = node.url || node['@id'];
        if (identity) {
          try { if (new URL(identity, location.origin).pathname !== location.pathname || new URL(identity, location.origin).origin !== location.origin) continue; }
          catch { continue; }
        }
        if (typeof node.datePosted === 'string') dates.publishTime ||= node.datePosted;
        if (typeof node.dateModified === 'string') dates.updateTime ||= node.dateModified;
      }
    }
    return { postDescription: section.innerText, ...dates };
  }
  if (!/^\/zhaopin\/?$/.test(location.pathname)) return { error: '猎聘搜索页已改变，请重新连接猎聘。' };
  // Locate the search provider from React's rendered tree. Never export the
  // provider itself, which may contain unrelated account and tracking state.
  const anchors = [...document.querySelectorAll('.jobDetailBox, .list-pagination-box, .job-list-box, #lp-search-job-box > *, #root, #app')];
  let state;
  for (const node of anchors) {
    const key = Object.keys(node).find(name => name.startsWith('__reactFiber$') || name.startsWith('__reactInternalInstance$'));
    for (let fiber = key && node[key]; fiber; fiber = fiber.return) {
      // A DOM node can retain the previous React fiber after a committed update.
      // Its alternate belongs to the current root in that case.
      let root = fiber;
      while (root.return) root = root.return;
      const currentFiber = root.stateNode?.current && root.stateNode.current !== root ? fiber.alternate : fiber;
      const candidate = currentFiber?.memoizedProps?.value?.state;
      if (Array.isArray(candidate?.searchJobData) && candidate.hasFilterData) { state = candidate; break; }
    }
    if (state) break;
  }
  if (!state) return { pending: true, stage: '岗位列表结构尚未加载' };
  if (state.isLoading || state.isjobLoading) return { pending: true, stage: '岗位列表正在加载' };
  const filters = state.hasFilterData;
  const findCode = (items, name) => {
    for (const item of items || []) {
      if (item.name === name) return String(item.code);
      const nested = findCode(item.children, name);
      if (nested) return nested;
    }
  };
  const options = state.allFilterData;
  if (!options) return { pending: true, stage: '搜索筛选选项尚未加载' };
  const city = input.city === '全国' ? '410' : findCode(options.dqs, input.city) || findCode(options.hotCities, input.city);
  const degree = input.degree ? findCode(options.educations, input.degree) : '';
  if (!city || (input.degree && !degree)) return { error: '猎聘尚未匹配所选城市或学历，请检查筛选条件。' };
  // Liepin's jobKind identifies recruiter families. Internship/campus options
  // belong to its native work-experience selector.
  const experienceName = input.job_type === '实习' ? '实习生' : input.job_type === '校招' ? '应届生' : '';
  const experience = experienceName ? findCode(options.workExperiences, experienceName) : '';
  const expected = { key: input.keyword, dq: city, eduLevel: degree || '', workYearCode: experience || '',
    jobKind: '', salaryCode: '', customSalary: '', pubTime: '', industry: '', compScale: '', compKind: '', compStage: '', compTag: '', compId: '', compName: '' };
  const matches = Object.entries(expected).every(([key, value]) => String(filters[key] || '').toLowerCase() === value.toLowerCase());
  if (input.operation === 'prepare') {
    if (matches) return { ready: true };
    const url = new URL('/zhaopin/', location.origin);
    Object.entries(expected).forEach(([key, value]) => { if (value) url.searchParams.set(key, value); });
    url.searchParams.set('currentPage', '0');
    return { navigate: url.href };
  }
  if (input.operation !== 'list') return { error: '不支持的猎聘读取操作。' };
  if (!matches) return { error: '猎聘搜索条件已改变，请在官网重新搜索。' };
  const pageSize = Number(filters.pageSize);
  const currentPage = Number(filters.currentPage);
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100 || !Number.isInteger(currentPage)) return { error: '猎聘分页格式发生变化，已保留已读结果。' };
  if (currentPage !== input.page - 1) {
    const url = new URL(location.href);
    url.searchParams.set('currentPage', String(input.page - 1));
    return { navigate: url.href };
  }
  const jobs = state.searchJobData.map(item => {
    const job = item.job || {};
    const company = item.comp || {};
    const tags = [job.campusJobKind, job.internMonth, job.requireStudent, job.requireWorkYears, ...(job.jobCardTags || [])].filter(Boolean).join(' ');
    return {
      platform: 'liepin', jobUrl: text(job.link) || text(job.pcLink), jobName: text(job.title),
      brandName: text(company.compName), salaryDesc: text(job.salary), cityName: text(job.dq),
      jobDegree: text(job.requireEduLevel), jobExperience: text(job.requireWorkYears),
      brandIndustry: text(company.compIndustry), brandNatureName: '',
      jobTypeName: /实习|在校/.test(tags) ? '实习' : /校招|校园|应届/.test(tags) || String(job.jobKind) === '7' ? '校招' : '',
    };
  });
  // totalCounts is the platform's page-size × page-count bound, not an exact count.
  return { jobs, hasMore: jobs.length > 0 && (currentPage + 1) * pageSize < Number(state.totalCounts) };
}
