// Executes in the platform page. Only whitelisted public job fields leave it.
export async function readZhaopinPage(input) {
  const text = value => typeof value === 'string' ? value.trim() : '';
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const body = document.body?.innerText || '';
  if (location.origin !== 'https://www.zhaopin.com') return { error: '智联页面已转入登录或其他站点，请完成登录后重试。' };
  if (/请完成(?:安全)?验证|请先完成安全验证|访问过于频繁|当前访问(?:存在)?异常|验证码验证/.test(body)) return { error: '智联要求验证或限制访问，已暂停读取，请查看智联页面。' };
  const filterVm = [...document.querySelectorAll('[class*=filter]')].map(node => node.__vue__).find(vm => vm?.$options?.name === 'FilterSearch');
  const loggedIn = filterVm?.$parent?.isLoggedIn ?? window.$session?.hasLoginToken;
  if (loggedIn === false || document.querySelector('.job-card__salary')?.textContent.includes('**')) return { error: '请先在智联搜索页完成登录，再返回官网搜索。' };
  const state = () => {
    const root = document.querySelector('.jobs-split-page')?.__vue__;
    const card = document.querySelector('.job-card')?.__vue__;
    const filter = [...document.querySelectorAll('[class*=filter]')].map(node => node.__vue__).find(vm => vm?.$store);
    return (root || card || filter)?.$store?.state || window.__INITIAL_STATE__;
  };
  if (input.operation === 'prepare') {
    const current = state();
    if (!current?.baseData?.allCity?.length) return { pending: true };
    const findCode = (items, name) => {
      for (const item of items || []) {
        if (item.name === name) return String(item.code);
        const nested = findCode(item.sublist, name);
        if (nested) return nested;
      }
    };
    const city = input.city === '全国' ? '489' : findCode(current.baseData.allCity, input.city);
    const degree = input.degree ? findCode(current.baseData.educationType, input.degree) : '';
    const typeName = input.job_type === '校招' ? '校园' : input.job_type === '实习' ? '实习' : '';
    const workType = typeName ? findCode(current.baseData.jobStatus, typeName) : '';
    if (!city || (input.degree && !degree) || (typeName && !workType)) return { error: '智联筛选选项尚未匹配，请检查城市、学历和招聘类型后重试。' };
    const query = {};
    for (const name of ['educationTypeCode', 'jobStatusCode', 'workExpTypeCode', 'companyTypeCode', 'industryCode',
      'salaryTypeCode', 'jobTypeCode', 'financingCode', 'companySizeCode', 'lineCode', 'stationCode']) query[name] = '';
    Object.assign(query, { jl: city, kw: input.keyword, educationTypeCode: degree || '', jobStatusCode: workType || '' });
    const matchesQuery = value => Object.entries(query).every(([key, expected]) => {
      const aliases = { educationTypeCode: 'el', jobStatusCode: 'et' };
      const actual = String(value?.queryParams?.[key] ?? value?.queryParams?.[aliases[key]] ?? '');
      return key === 'kw' ? actual.trim().toLowerCase() === expected.toLowerCase() : actual === expected;
    });
    const previousRead = filterVm?.__knowviaSearchRead;
    if (!matchesQuery(current) || previousRead?.failed) {
      if (typeof filterVm?.emitConfirm !== 'function') return { error: '智联筛选入口发生变化，已暂停读取。' };
      const previousList = current.positionList;
      const read = { failed: false, pending: true };
      filterVm.__knowviaSearchRead = read;
      // Native filtering preserves the page's signed-in state and handles its own requests.
      filterVm.emitConfirm('region', query);
      const deadline = Date.now() + 22000;
      while (Date.now() < deadline) {
        await delay(250);
        const updated = state();
        if (!matchesQuery(updated)) { read.failed = true; read.pending = false; return { error: '智联搜索条件已改变，请在官网重新搜索。' }; }
        if (Array.isArray(updated.positionList) && updated.positionList !== previousList && !updated.loadingStatus) {
          read.pending = false;
          return { ready: true };
        }
        if (updated.listLoadError) break;
      }
      // The native page can retain the previous list after a failed filter request.
      // Keep this failure across a retry so an unchanged URL cannot accept stale rows.
      read.failed = true;
      read.pending = false;
      return { error: '智联未返回新筛选条件的岗位，已暂停读取。请检查智联页面后恢复读取。' };
    }
    if (current.listLoadError) return { error: '智联搜索未能加载，请检查平台页面后重试。' };
    if (current.loadingStatus) return { pending: true };
    return { ready: true };
  }
  if (input.operation === 'detail') {
    if (/^\/jobs\/?$/.test(location.pathname)) {
      const current = state();
      const card = [...document.querySelectorAll('.job-card')].find(node => node.__vue__?.job?.number === input.jobId);
      if (!card) return { error: '智联搜索页已没有这个岗位，请重新搜索。' };
      if (current?.selectedJobId !== input.jobId) { card.click(); return { pending: true }; }
      if (current.jobDetailLoading) return { pending: true };
    } else if (location.pathname !== `/jobdetail/${input.jobId}.htm`) return { error: '智联详情已转入其他页面，请在智联检查岗位链接。' };
    const section = document.querySelector('.job-detail-panel .job-description, .describtion-card__detail-content, .describtion__detail-content');
    if (!document.querySelector('h1') || !section) return { pending: true };
    if (/登录查看完整内容/.test(section.innerText) || section.querySelector('[class*=guest-clamp]')) return { error: '智联详情需要登录，请在智联完成登录后恢复读取。' };
    const selected = [...document.querySelectorAll('.job-card')].find(node => node.__vue__?.job?.number === input.jobId)?.__vue__?.job;
    const dates = selected?.jobDetailData?.position?.date;
    return { postDescription: section.innerText,
      publishTime: text(selected?.publishTime) || text(dates?.positionPublishTime) || text(dates?.firstPublishTime),
      updateTime: text(dates?.positionUpdateTime) };
  }
  if (input.operation !== 'list') return { error: '不支持的智联读取操作。' };
  if (!/^\/jobs\/?$/.test(location.pathname)) return { error: '智联搜索页已改变，请重新连接智联。' };
  if (filterVm?.__knowviaSearchRead?.failed) return { error: '智联未返回新筛选条件的岗位，请恢复读取后重试。' };
  if (filterVm?.__knowviaSearchRead?.pending) return { pending: true };
  let current = state();
  if (!Array.isArray(current?.positionList)) return { pending: true };
  if (String(current.queryParams?.kw || '').trim().toLowerCase() !== input.keyword.trim().toLowerCase()) return { error: '智联搜索关键词已改变，请在官网重新搜索。' };
  const pageSize = Number(current.pageSize);
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) return { error: '智联列表分页格式发生变化，已暂停读取。' };
  const end = input.page * pageSize;
  const deadline = Date.now() + 22000;
  while (current.positionList.length < end && current.hasMore === true) {
    const previousCount = current.positionList.length;
    const panel = document.querySelector('.job-card')?.__vue__?.$parent;
    if (!panel?.$listeners?.['load-more']) return { error: '智联后续岗位加载入口发生变化，已保留已读结果。' };
    // Uses the same event as the visible list's scroll handler.
    if (!current.loadingMore) panel.$emit('load-more');
    do {
      await delay(250);
      current = state();
      if (current?.listLoadError) return { error: '智联后续岗位未能加载，请检查智联页面后恢复读取。' };
      if (Date.now() >= deadline) return { error: '智联后续岗位加载超时，已保留已读结果，可恢复读取。' };
    } while (current && current.positionList.length === previousCount && current.hasMore === true);
    if (!Array.isArray(current?.positionList)) return { error: '智联岗位列表已改变，请重新搜索。' };
    if (current.positionList.length < end && current.hasMore) await delay(2000 + Math.floor(Math.random() * 1001));
  }
  const cards = [...document.querySelectorAll('.job-card')];
  const jobs = current.positionList.slice((input.page - 1) * pageSize, end).map(job => {
    const card = cards.find(node => node.__vue__?.job?.number === job.number);
    const detail = job.jobDetailData?.position;
    const description = text(detail?.desc?.description);
    const plainDescription = description ? new DOMParser().parseFromString(description, 'text/html').body.textContent.trim() : '';
    const type = text(job.workType);
    const campus = /校招|校园|应届/.test(`${job.name} ${job.workingExp}`);
    return {
      platform: 'zhaopin', jobUrl: text(job.positionURL) || text(job.positionUrl), jobName: text(job.name),
      brandName: text(job.companyName), salaryDesc: text(card?.querySelector('.job-card__salary')?.textContent) || text(job.salary60),
      cityName: text(job.workCity), areaDistrict: text(job.cityDistrict), jobDegree: text(job.education),
      jobExperience: text(job.workingExp), brandIndustry: text(job.industryName), brandNatureName: text(job.propertyName),
      jobTypeName: type === '实习' ? '实习' : type === '校园' || campus ? '校招' : type === '全职' ? '社招' : '',
      postDescription: plainDescription, applicationDeadline: text(detail?.date?.dateEnd),
      publishTime: text(job.publishTime) || text(detail?.date?.positionPublishTime) || text(detail?.date?.firstPublishTime),
      updateTime: text(detail?.date?.positionUpdateTime),
      detailRead: Boolean(plainDescription && detail?.base?.positionNumber === job.number),
    };
  });
  return { jobs, hasMore: current.positionList.length > end || current.hasMore === true };
}
