import { ORIGINS } from './protocol.js';
import { readLiepinPage } from './liepin-page.js';

const origin = 'https://www.liepin.com';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const owners = new Map();

export function liepinParameters(input, detail = false) {
  if (detail) {
    const url = new URL(input?.url || 'about:blank');
    const path = /^\/(job|a)\/(\d{1,20})\.shtml$/.exec(url.pathname);
    if (url.origin !== origin || url.username || url.password || !path || input.jobId !== `${path[1]}/${path[2]}`)
      throw new Error('猎聘岗位详情地址无效，请重新搜索。');
    return { operation: 'detail', jobId: input.jobId, url: url.href };
  }
  if (!input || typeof input.keyword !== 'string' || !input.keyword.trim() || input.keyword.length > 100
    || typeof input.city !== 'string' || !/^[\u4e00-\u9fff]{2,20}$/.test(input.city)
    || !['', '大专', '本科', '硕士', '博士'].includes(input.degree)
    || !['', '实习', '校招', '社招'].includes(input.job_type)
    || !Number.isInteger(input.page) || input.page < 1 || input.page > 500) throw new Error('猎聘搜索参数无效，请重新搜索。');
  return { keyword: input.keyword.trim(), city: input.city, degree: input.degree, job_type: input.job_type, page: input.page };
}

async function searchTab(sender, create = false) {
  const websites = (await chrome.tabs.query({ url: ['http://127.0.0.1/*', 'http://localhost/*'] }))
    .filter(tab => { try { return ORIGINS.has(new URL(tab.url).origin); } catch { return false; } });
  for (const [id, owner] of owners) if (!websites.some(tab => tab.id === owner)) owners.delete(id);
  const candidates = (await chrome.tabs.query({ url: `${origin}/zhaopin/*` }))
    .filter(tab => Boolean(tab.incognito) === Boolean(sender.tab.incognito)
      && /^https:\/\/www\.liepin\.com\/zhaopin\/?(?:\?|$)/.test(tab.url || '')
      && (!owners.has(tab.id) || owners.get(tab.id) === sender.tab.id)
      && (!websites.some(website => website.id === tab.openerTabId) || tab.openerTabId === sender.tab.id))
    .sort((a, b) => Number(owners.get(b.id) === sender.tab.id) - Number(owners.get(a.id) === sender.tab.id)
      || Number(b.windowId === sender.tab.windowId) - Number(a.windowId === sender.tab.windowId)
      || (b.lastAccessed || 0) - (a.lastAccessed || 0));
  if (candidates[0]) return candidates[0];
  if (create) return chrome.tabs.create({ url: `${origin}/zhaopin/`, active: false, windowId: sender.tab.windowId, openerTabId: sender.tab.id });
}

async function runInTab(tabId, input) {
  let navigated = false;
  let stage = '页面正在加载';
  for (let attempt = 0; attempt < 80; attempt++) {
    const tab = await chrome.tabs.get(tabId);
    const url = new URL(tab.pendingUrl || tab.url || 'about:blank');
    if (url.origin !== origin) throw new Error('猎聘页面已跳转或变为空白，请检查该标签页。已读取岗位会保留。');
    // Recruitment data can be ready while third-party page assets keep loading.
    // Only defer when a new document has not committed yet.
    if (!tab.pendingUrl || tab.pendingUrl === tab.url) {
      let data;
      try {
        const result = await chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', func: readLiepinPage, args: [input] });
        data = result[0]?.result;
      } catch (error) {
        if (!/Frame.*removed|No frame|frame.*not found/i.test(error.message)) throw error;
      }
      if (data?.error) throw new Error(data.error);
      if (data?.stage) stage = data.stage;
      if (data?.navigate) {
        if (navigated) throw new Error('猎聘未加载新的搜索条件，已暂停读取，请查看猎聘页面。');
        const target = new URL(data.navigate);
        if (target.origin !== origin || target.pathname !== '/zhaopin/') throw new Error('猎聘搜索地址无效。');
        await chrome.tabs.update(tabId, { url: target.href });
        navigated = true;
      } else if (data && !data.pending) return data;
    }
    await wait(250);
  }
  throw new Error(`猎聘${stage}，请查看猎聘页面后恢复读取。`);
}

export async function handleLiepin(message, sender) {
  if (message.command === 'PING') {
    const tab = await searchTab(sender);
    return { browser_running: Boolean(tab), search_ready: Boolean(tab), rendered_metadata: false };
  }
  if (message.command === 'OPEN_LIEPIN') {
    const tab = await searchTab(sender, true);
    await chrome.tabs.update(tab.id, { active: true });
    return { message: '已在当前浏览器打开猎聘，完成登录后返回官网搜索。' };
  }
  if (message.command === 'FETCH_DETAIL') {
    const params = liepinParameters(message.payload, true);
    const tab = await chrome.tabs.create({ url: params.url, active: false, windowId: sender.tab.windowId, openerTabId: sender.tab.id });
    try { return await runInTab(tab.id, params); }
    finally { await chrome.tabs.remove(tab.id).catch(() => {}); }
  }
  if (!['PREPARE', 'FETCH_PAGE'].includes(message.command)) throw new Error('不支持此猎聘操作。');
  const params = liepinParameters(message.payload);
  const tab = await searchTab(sender, message.command === 'PREPARE');
  if (!tab) throw new Error('猎聘搜索标签页已关闭，请先连接猎聘。');
  if (message.command === 'PREPARE') owners.set(tab.id, sender.tab.id);
  return runInTab(tab.id, { ...params, operation: message.command === 'PREPARE' ? 'prepare' : 'list' });
}
