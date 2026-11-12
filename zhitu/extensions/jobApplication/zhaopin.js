import { ORIGINS } from './protocol.js';
import { readZhaopinPage } from './zhaopin-page.js';

const origin = 'https://www.zhaopin.com';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const searchOwners = new Map();

export function zhaopinParameters(input, detail = false) {
  if (detail) {
    const url = new URL(input?.url || 'about:blank');
    if (typeof input?.jobId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(input.jobId)
      || url.origin !== origin || url.username || url.password || url.pathname !== `/jobdetail/${input.jobId}.htm`)
      throw new Error('智联岗位详情地址无效，请重新搜索。');
    return { operation: 'detail', jobId: input.jobId, url: url.href };
  }
  if (!input || typeof input.keyword !== 'string' || !input.keyword.trim() || input.keyword.length > 100
    || typeof input.city !== 'string' || !/^[\u4e00-\u9fff]{2,20}$/.test(input.city)
    || !['', '大专', '本科', '硕士', '博士'].includes(input.degree)
    || !['', '实习', '校招', '社招'].includes(input.job_type)
    || !Number.isInteger(input.page) || input.page < 1 || input.page > 500) throw new Error('智联搜索参数无效，请重新搜索。');
  return { keyword: input.keyword.trim(), city: input.city, degree: input.degree, job_type: input.job_type, page: input.page };
}

async function searchTab(sender, create = false) {
  const websites = (await chrome.tabs.query({ url: ['http://127.0.0.1/*', 'http://localhost/*'] }))
    .filter(tab => { try { return ORIGINS.has(new URL(tab.url).origin); } catch { return false; } });
  for (const [tabId, owner] of searchOwners) if (!websites.some(website => website.id === owner)) searchOwners.delete(tabId);
  const candidates = (await chrome.tabs.query({ url: `${origin}/jobs*` }))
    .filter(tab => Boolean(tab.incognito) === Boolean(sender.tab.incognito)
      && /^https:\/\/www\.zhaopin\.com\/jobs\/?(?:\?|$)/.test(tab.url || '')
      && (!searchOwners.has(tab.id) || searchOwners.get(tab.id) === sender.tab.id)
      && (!websites.some(website => website.id === tab.openerTabId) || tab.openerTabId === sender.tab.id))
    .sort((a, b) => Number(b.openerTabId === sender.tab.id) - Number(a.openerTabId === sender.tab.id)
      || Number(b.windowId === sender.tab.windowId) - Number(a.windowId === sender.tab.windowId)
      || Number(b.active) - Number(a.active) || (b.lastAccessed || 0) - (a.lastAccessed || 0));
  for (const tab of candidates) {
    try {
      const result = await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: 'MAIN', func: () => {
        const filter = [...document.querySelectorAll('[class*=filter]')].map(node => node.__vue__).find(vm => vm?.$options?.name === 'FilterSearch');
        return Boolean(filter?.$parent?.isLoggedIn ?? window.$session?.hasLoginToken);
      } });
      if (result[0]?.result) return tab;
    } catch { /* The platform may be replacing this document during login. */ }
  }
  if (candidates[0]) return candidates[0];
  if (create) return chrome.tabs.create({ url: `${origin}/jobs/?jl=489&kw=`, active: false,
    windowId: sender.tab.windowId, openerTabId: sender.tab.id });
}

async function runInTab(tabId, input) {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const tab = await chrome.tabs.get(tabId);
      if (new URL(tab.pendingUrl || tab.url || 'about:blank').origin !== origin) throw new Error('智联已转入登录或其他页面，请完成登录后恢复读取。');
      const result = await chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', args: [input], func: readZhaopinPage });
      const data = result[0]?.result;
      if (data?.error) throw new Error(data.error);
      if (data && !data.pending) return data;
    } catch (error) {
      if (!/Frame.*removed|No frame|Cannot access contents|about:blank|frame.*not found/i.test(error.message)) throw error;
    }
    await wait(250);
  }
  throw new Error('智联页面尚未加载完成，请检查该标签页后恢复读取。');
}

export async function handleZhaopin(message, sender) {
  if (message.command === 'PING') {
    const tab = await searchTab(sender);
    return { browser_running: Boolean(tab), search_ready: Boolean(tab), rendered_metadata: false };
  }
  if (message.command === 'OPEN_ZHAOPIN') {
    const tab = await searchTab(sender, true);
    await chrome.tabs.update(tab.id, { active: true });
    return { message: '已在当前浏览器打开智联。完成登录后返回官网搜索即可。' };
  }
  if (message.command === 'FETCH_DETAIL') {
    const params = zhaopinParameters(message.payload, true);
    const tab = await searchTab(sender);
    if (!tab) throw new Error('智联搜索标签页已关闭，请连接智联后恢复详情读取。');
    return runInTab(tab.id, params);
  }
  if (!['PREPARE', 'FETCH_PAGE'].includes(message.command)) throw new Error('不支持此智联操作。');
  const params = zhaopinParameters(message.payload);
  const tab = await searchTab(sender, message.command === 'PREPARE');
  if (!tab) throw new Error('智联搜索标签页已关闭，请先连接智联后恢复读取。');
  if (message.command === 'PREPARE') {
    if (tab.windowId === sender.tab.windowId) await chrome.tabs.update(tab.id, { openerTabId: sender.tab.id });
    searchOwners.set(tab.id, sender.tab.id);
    for (let attempt = 0; attempt < 4; attempt++) {
      const result = await runInTab(tab.id, { ...params, operation: 'prepare' });
      if (result.ready) return result;
      await wait(500);
    }
    throw new Error('智联搜索条件尚未加载完成，请查看智联页面后恢复读取。');
  }
  return runInTab(tab.id, { ...params, operation: 'list' });
}
