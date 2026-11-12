const BOSS = 'https://www.zhipin.com';
export function jobDestination(input) {
  if (!input || typeof input.url !== 'string' || input.url.length > 6000
    || (input.retry !== undefined && typeof input.retry !== 'boolean')) throw new Error('岗位地址无效，请重新搜索。');
  let url;
  try { url = new URL(input.url); } catch { throw new Error('岗位地址无效，请重新搜索。'); }
  if (url.origin !== BOSS || url.username || url.password || !/^\/job_detail\/[\w-]{1,100}\.html$/.test(url.pathname))
    throw new Error('只能打开 BOSS 的准确岗位详情地址。');
  return url;
}

export function destinationState(tab, expectedPath) {
  // tabs.update resolves before the navigation commits. The old URL can still be home.
  const address = tab.pendingUrl || tab.url;
  if (!address || address === 'about:blank') return 'loading';
  let url;
  try { url = new URL(address); } catch { return 'redirected'; }
  if (url.origin !== BOSS) return 'redirected';
  if (/\/security(?:\.html|\/|$)|captcha|verify/i.test(url.pathname)) return 'verification';
  if (/\/passport(?:\/|$)|\/login(?:[/.]|$)|^\/web\/user\/?$/.test(url.pathname)) return 'login';
  if (url.pathname === '/') return 'home';
  if (url.pathname !== expectedPath) return 'redirected';
  return 'loading';
}

// Executed only in the job tab created for this click. Return status, never page/account data.
export function inspectJobDestination(expectedPath) {
  if (location.origin !== 'https://www.zhipin.com' || location.pathname !== expectedPath) return 'loading';
  const body = document.body?.innerText || '';
  if (/请完成(?:安全)?验证|安全验证|访问过于频繁|访问环境异常|您的环境存在异常/.test(body)) return 'verification';
  if (/该职位已关闭|职位已下线|职位不存在|职位已停止招聘|职位已失效/.test(body)) return 'unavailable';
  const details = document.querySelector('.job-detail-section, .job-sec-text');
  return details?.textContent?.trim() ? 'ready' : 'loading';
}

export function createJobNavigation(browser, { settle = async () => {}, now = Date.now, id = () => crypto.randomUUID() } = {}) {
  const tasks = new Map();
  const opening = new Set();
  const response = task => ({ navigationId: task.id, state: task.state });
  const lookup = (sender, input) => {
    const task = tasks.get(sender.tab.id);
    if (!task || typeof input?.navigationId !== 'string' || input.navigationId !== task.id)
      throw new Error('打开状态已结束，原岗位标签页仍可查看。');
    return task;
  };
  async function ownedTab(task, sender) {
    try {
      const tab = await browser.tabs.get(task.tabId);
      return Boolean(tab.incognito) === Boolean(sender.tab.incognito) ? tab : undefined;
    } catch { return undefined; }
  }
  async function observe(task, sender) {
    const tab = await ownedTab(task, sender);
    if (!tab) { task.state = 'closed'; return response(task); }
    let state = destinationState(tab, task.path);
    if (state === 'loading' && !tab.pendingUrl && tab.status === 'complete' && tab.url?.startsWith(BOSS + task.path)) {
      try {
        const result = await browser.scripting.executeScript({ target: { tabId: task.tabId }, args: [task.path], func: inspectJobDestination });
        if (['ready', 'verification', 'unavailable', 'loading'].includes(result[0]?.result)) state = result[0].result;
      } catch { /* Navigation may still be replacing the document. */ }
    }
    if (state === 'loading' && now() - task.started >= 30000) state = 'timeout';
    task.state = state;
    return response(task);
  }
  return {
    pending: () => opening.size > 0 || [...tasks.values()].some(task =>
      ['loading', 'verification', 'login'].includes(task.state) && now() - task.started < 120000),
    forget: owner => tasks.delete(owner),
    async open(sender, input) {
      const url = jobDestination(input), owner = sender.tab.id;
      if (opening.has(owner)) throw new Error('正在打开岗位，请稍候。');
      opening.add(owner);
      try {
        await settle(owner);
        const previous = tasks.get(owner);
        const tab = previous && previous.url === url.href ? await ownedTab(previous, sender) : undefined;
        const state = tab ? destinationState(tab, url.pathname) : 'closed';
        // Never repurpose a user tab that has left this job/verification/home flow.
        const reusable = tab && ['loading', 'verification', 'login', 'home'].includes(state)
          && tab.url?.startsWith(BOSS + '/');
        if (reusable && !input.retry) {
          await browser.tabs.update(tab.id, { active: true });
          return observe(previous, sender);
        }
        const opened = reusable
          ? await browser.tabs.update(tab.id, { url: url.href, active: true })
          : await browser.tabs.create({ url: url.href, active: true, windowId: sender.tab.windowId, openerTabId: owner });
        const task = { id: id(), url: url.href, path: url.pathname, tabId: opened.id, started: now(), state: 'loading' };
        tasks.set(owner, task);
        return response(task);
      } finally { opening.delete(owner); }
    },
    status: (sender, input) => observe(lookup(sender, input), sender),
    async focus(sender, input) {
      const task = lookup(sender, input), tab = await ownedTab(task, sender);
      if (tab && (tab.pendingUrl || tab.url)?.startsWith(BOSS + '/') && destinationState(tab, task.path) !== 'redirected')
        await browser.tabs.update(tab.id, { active: true });
      return observe(task, sender);
    },
  };
}
