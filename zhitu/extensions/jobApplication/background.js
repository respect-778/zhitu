import { authorizedSender, ORIGINS, searchParameters, detailParameters, chatParameters, chatActionParameters } from './protocol.js';
import { readBossDetail } from './detail.js';
import { BOSS, bossTabs, searchTab, chatTab } from './connection.js';
import { readBossChat } from './chat.js';
import { readBossContext, readBossApplications } from './chat-platform.js';
import { readBossResumes } from './chat-resumes.js';
import { performBossChatAction } from './chat-actions.js';
import { createUpdater } from './updates.js';
import { readRenderedMetadata } from './rendered.js';
import { createJobNavigation, jobDestination } from './navigation.js';
import { inspectSearchPage, matchesSearchPage } from './search-page.js';
import { handleZhaopin } from './zhaopin.js';
import { handleLiepin } from './liepin.js';
import { createOfficialAutofill } from './autofill.js';

const inFlight = new Set();
const busyUntil = new Map();
const chatSessions = new Map();
const pendingChatReads = new Map();
const chatOperations = new Map();
const activeChatRequests = new Set();
const pausedReaders = new Set();
const openingJobs = new Set();
let readerTabId;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const navigation = createJobNavigation(chrome, { settle: async owner => {
  const deadline = Date.now() + 20000;
  while (inFlight.has(owner)) {
    if (Date.now() >= deadline) throw new Error('后台读取尚在结束，后续读取已暂停。请稍后重试这个岗位。');
    await pause(100);
  }
} });
const officialAutofill = createOfficialAutofill(chrome);
const updater = createUpdater(chrome.runtime, () => !officialAutofill.busy() && !inFlight.size && !activeChatRequests.size && !openingJobs.size && !navigation.pending() && ![...busyUntil.values()].some(time => time > Date.now()));
chrome.tabs.onRemoved.addListener(id => { navigation.forget(id); pausedReaders.delete(id); busyUntil.delete(id); });
chrome.tabs.onRemoved.addListener(id => { void officialAutofill.forget(id).catch(() => {}); });
chrome.tabs.onUpdated.addListener((id, change) => {
  if (change.status === 'loading') void officialAutofill.interruptOwner(id).catch(() => {});
  if (change.status === 'complete' || change.url) void officialAutofill.tick().catch(() => {});
});
chrome.alarms.create('knowvia-official-autofill', { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'knowvia-official-autofill') void officialAutofill.tick().catch(() => {});
});
async function reconnectWebsites() {
  const tabs = await chrome.tabs.query({ url: ['http://127.0.0.1/*', 'http://localhost/*'] });
  await Promise.allSettled(tabs.filter(tab => { try { return ORIGINS.has(new URL(tab.url).origin); } catch { return false; } })
    .map(tab => chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] })));
}
chrome.runtime.onInstalled.addListener(() => { void reconnectWebsites(); });
async function ready(tabId) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const tab = await chrome.tabs.get(tabId);
    if (tab.status === 'complete' && !tab.pendingUrl && tab.url && tab.url !== 'about:blank') return tab;
    await pause(200);
  }
  throw new Error('BOSS 页面尚未加载完成，请在该标签页检查后重试。');
}
async function readySearchPage(tabId) {
  await ready(tabId);
  let state = 'loading';
  for (let attempt = 0; attempt < 16; attempt++) {
    const tab = await chrome.tabs.get(tabId);
    const address = tab.pendingUrl || tab.url || '';
    const pathname = new URL(address || 'about:blank').pathname;
    if (/\/security(?:\.html|\/|$)|captcha|verify/i.test(pathname))
      throw new Error('BOSS 搜索页要求安全验证，请在该页面完成后恢复读取。');
    if (!/^https:\/\/www\.zhipin\.com\/web\/geek\/jobs?(?:[/?#]|$)/.test(address))
      throw new Error('BOSS 搜索页已转入登录或其他页面，请查看 BOSS 页面后恢复读取。');
    if (!tab.pendingUrl && tab.status === 'complete') {
      const results = await chrome.scripting.executeScript({ target: { tabId }, func: inspectSearchPage });
      state = results[0]?.result || 'loading';
      if (state === 'ready') return;
      if (state === 'verification') throw new Error('BOSS 搜索页要求安全验证或提示环境异常，请在该页面处理后恢复读取。');
      if (state === 'login' || state === 'redirected') throw new Error('BOSS 搜索页已转入登录或其他页面，请查看 BOSS 页面后恢复读取。');
    }
    if (attempt < 15) await pause(500);
  }
  throw new Error(state === 'blank'
    ? 'BOSS 搜索页仍为空白，尚未显示岗位内容。请先在 BOSS 页面确认搜索能正常显示，再返回恢复读取。'
    : 'BOSS 搜索页仍在加载，尚未显示岗位内容。请等待该页面加载完成后恢复读取。');
}
async function readChat(message, sender) {
  const applications = message.command === 'READ_BOSS_APPLICATIONS';
  const tab = await chatTab(sender) || (applications ? await searchTab(sender) : null);
  if (!tab) throw new Error('请先打开当前浏览器的 BOSS 聊天页，再读取会话。');
  const previous = chatOperations.get(tab.id) || Promise.resolve();
  const operation = previous.catch(() => undefined).then(async () => {
    const current = await ready(tab.id);
    if (applications) {
      const output = await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: 'MAIN', func: readBossApplications });
      const result = output[0]?.result;
      if (!result || result.error) throw new Error(result?.error || 'BOSS 未返回投递记录。');
      return result;
    }
    if (!/^https:\/\/www\.zhipin\.com\/web\/geek\/chat(?:[/?#]|$)/.test(current.url || '')) {
      throw new Error('BOSS 聊天页已离开，请检查登录或验证提示后重新连接。');
    }
    if (message.command === 'READ_BOSS_RESUMES') {
      const params = chatParameters(message.payload);
      const session = chatSessions.get(sender.tab.id);
      if (session?.tabId !== tab.id || session?.sessionId !== params.sessionId)
        throw new Error('浏览器会话已变化，请刷新会话后读取附件。');
      const outputs = await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: 'MAIN',
        func: readBossResumes, args: [{ accountId: message.payload.accountId }] });
      const catalog = outputs[0]?.result;
      if (!catalog || catalog.error) throw new Error(catalog?.error || '附件列表未返回。');
      return catalog;
    }
    const action = message.command === 'SEND_BOSS_MESSAGE' ? 'message' : message.command === 'SEND_BOSS_RESUME' ? 'resume' : null;
    let params = { operation: message.command === 'READ_BOSS_INBOX' ? 'inbox' : 'snapshot' };
    if (message.command === 'SELECT_BOSS_CONVERSATION' || action) {
      params = chatParameters(message.payload);
      const session = chatSessions.get(sender.tab.id);
      if (session?.tabId !== tab.id || session?.sessionId !== params.sessionId) {
        throw new Error('浏览器会话已变化，请刷新会话列表后重试。');
      }
    }
    let timer;
    try {
      const results = await Promise.race([
        chrome.scripting.executeScript({ target: { tabId: tab.id }, world: 'ISOLATED',
          args: [{ ...params, returnErrors: true }], func: readBossChat }),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('BOSS 聊天读取超时，请检查聊天页加载情况后重新读取。')), 12000); }),
      ]);
      const result = results[0]?.result;
      if (result?.error) throw new Error(result.error);
      if (!result?.sessionId) throw new Error('BOSS 聊天页未返回记录，请检查页面后重试。');
      const contexts = await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: 'MAIN', func: readBossContext });
      const context = contexts[0]?.result;
      result.accountId = context?.accountId || '';
      result.conversations = result.conversations.map(row => {
        const metadata = context?.conversations?.find(item => item.id === row.id);
        return { ...row, unreadReply: metadata?.unreadReply === true,
          replyVersion: metadata?.replyVersion || '', lastIsHr: metadata?.lastIsHr === true,
          ...(metadata?.resumeState ? { resumeState: metadata.resumeState, resumeReason: metadata.resumeReason } : {}) };
      });
      chatSessions.set(sender.tab.id, { tabId: tab.id, sessionId: result.sessionId });
      if (action) {
        const request = chatActionParameters(message.payload, action);
        if (request.accountId !== result.accountId) throw new Error('BOSS 账号已变化，请同步后重新发送。');
        let resume;
        if (action === 'resume') {
          const catalogs = await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: 'MAIN',
            func: readBossResumes, args: [{ accountId: request.accountId }] });
          const catalog = catalogs[0]?.result;
          if (!catalog || catalog.error) throw new Error(catalog?.error || '附件列表未返回。');
          resume = catalog.resumes.find(item => item.id === request.resumeId);
          if (!resume || resume.restricted) return { operationId: request.operationId, conversationId: request.conversationId,
            status: 'failed', message: !resume ? '所选附件已不存在，请重新读取附件。' : (resume.restriction || 'BOSS 暂不允许发送此附件。') };
        }
        const recipient = result.conversations.find(row => row.id === request.conversationId);
        const responses = await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: 'MAIN',
          func: performBossChatAction, args: [{ ...request, recipient, resume }] });
        const outcome = responses[0]?.result;
        if (!outcome || outcome.error) throw new Error(outcome?.error || '发送结果尚未确认，请在 BOSS 核对。');
        return outcome;
      }
      return result;
    } finally { clearTimeout(timer); }
  });
  chatOperations.set(tab.id, operation);
  try { return await operation; }
  catch (error) {
    if (/Frame with ID|No frame with id|No tab with id|tab was closed|frame was removed/i.test(error.message || '')) {
      throw new Error('BOSS 聊天页已关闭或正在刷新，请重新打开聊天页后读取会话。');
    }
    throw error;
  } finally {
    if (chatOperations.get(tab.id) === operation) chatOperations.delete(tab.id);
  }
}
async function renderedMetadata(params, sourceTab) {
  const url = `${BOSS}/job_detail/${params.jobId}.html?${new URLSearchParams({ securityId: params.securityId })}`;
  const tab = await chrome.tabs.create({ url: 'about:blank', active: false, windowId: sourceTab.windowId, openerTabId: sourceTab.id });
  try {
    await chrome.tabs.update(tab.id, { url });
    await ready(tab.id);
    await pause(500);
    for (let attempt = 0; attempt < 8; attempt++) {
      const results = await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: 'MAIN',
        args: [{ ...params, allowMissingMetadata: attempt === 7 }], func: readRenderedMetadata });
      const payload = results[0]?.result;
      if (payload?.error) throw new Error(payload.error);
      if (payload && !payload.pending) return payload;
      await pause(250);
    }
    return { detailWarning: '渲染后的岗位信息尚未就绪，缺失信息未完成核验。' };
  } finally {
    // This ID was created above. Never close or navigate the user's source tab.
    await chrome.tabs.remove(tab.id).catch(() => {});
  }
}
async function handle(message, sender) {
  if (message.command === 'PING') {
    if (message.payload?.busy) busyUntil.set(sender.tab.id, Date.now() + 45000);
    else busyUntil.delete(sender.tab.id);
  }
  if (message.command === 'OPEN_LIEPIN' || message.payload?.platform === 'liepin') {
    const result = await handleLiepin(message, sender);
    return message.command === 'PING' ? { ...result, installed: true, version: chrome.runtime.getManifest().version,
      updating: await updater.check(), job_navigation: true, official_autofill: true, official_autofill_systems: ['moka', 'feishu', 'beisen'], platforms: ['boss', 'zhaopin', 'liepin'] } : result;
  }
  if (message.command === 'OPEN_ZHAOPIN' || message.payload?.platform === 'zhaopin') {
    const result = await handleZhaopin(message, sender);
    return message.command === 'PING' ? { ...result, installed: true, version: chrome.runtime.getManifest().version,
      updating: await updater.check(), job_navigation: true, official_autofill: true, official_autofill_systems: ['moka', 'feishu', 'beisen'], platforms: ['boss', 'zhaopin', 'liepin'] } : result;
  }
  if (message.command === 'PING') {
    return { installed: true, browser_running: (await bossTabs(sender)).length > 0,
      version: chrome.runtime.getManifest().version, updating: await updater.check(), rendered_metadata: true,
      search_ready: Boolean(await searchTab(sender)), chat_history: true, chat_actions: true, resume_picker: true, application_history: true, job_navigation: true, official_autofill: true, official_autofill_systems: ['moka', 'feishu', 'beisen'], platforms: ['boss', 'zhaopin', 'liepin'] };
  }
  if (message.command === 'OPEN_BOSS_CHAT') {
    const tab = await chatTab(sender, true);
    await chrome.tabs.update(tab.id, { active: true });
    return { opened: true };
  }
  if (['READ_BOSS_CHAT', 'READ_BOSS_INBOX', 'READ_BOSS_APPLICATIONS', 'READ_BOSS_RESUMES', 'SELECT_BOSS_CONVERSATION', 'SEND_BOSS_MESSAGE', 'SEND_BOSS_RESUME'].includes(message.command)) {
    return readChat(message, sender);
  }
  if (message.command === 'OPEN_BOSS') {
    const tabs = await bossTabs(sender);
    const tab = await searchTab(sender) || tabs.find(item => item.windowId === sender.tab.windowId) || tabs[0];
    if (tab) await chrome.tabs.update(tab.id, { active: true });
    else await chrome.tabs.create({ url: `${BOSS}/web/geek/job`, active: true, windowId: sender.tab.windowId, openerTabId: sender.tab.id });
    return { message: '已在当前浏览器打开 BOSS。完成登录后返回官网搜索即可。' };
  }
  if (!['PREPARE', 'FETCH_PAGE', 'FETCH_DETAIL', 'READ_METADATA'].includes(message.command)) throw new Error('不支持此操作，请更新岗位读取助手。');
  const params = ['FETCH_DETAIL', 'READ_METADATA'].includes(message.command) ? detailParameters(message.payload) : searchParameters(message.payload);
  let tab = await searchTab(sender, message.command === 'PREPARE');
  if (!tab) throw new Error('BOSS 搜索标签页已关闭或离开搜索页面，读取已暂停。请返回 BOSS 搜索页后重新搜索；若页面要求登录或验证，请先完成。');
  if (message.command === 'READ_METADATA') return renderedMetadata(params, tab);
  if (message.command === 'FETCH_DETAIL') {
    tab = await ready(tab.id);
    if (new URL(tab.url).origin !== BOSS) throw new Error('BOSS 标签页已改变，请重新连接。');
    const results = await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: 'MAIN', args: [params], func: readBossDetail });
    const payload = results[0]?.result;
    if (!payload || payload.error) throw new Error(payload?.error || '岗位详情未返回，请稍后重试。');
    return payload;
  }
  if (message.command === 'PREPARE') {
    const query = new URLSearchParams(params);
    query.delete('page'); query.delete('pageSize');
    if (!matchesSearchPage(tab.url, params)) {
      await chrome.tabs.update(tab.id, { url: `${BOSS}/web/geek/job?${query}` });
      await ready(tab.id);
      await pause(1500);
    }
    await readySearchPage(tab.id);
    return { ready: true };
  }
  tab = await ready(tab.id);
  if (!tab.url?.startsWith(`${BOSS}/web/geek/job`)) throw new Error('BOSS 搜索页已改变，请重新搜索；若提示登录或验证，请先完成。');
  await readySearchPage(tab.id);
  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id }, world: 'MAIN', args: [params],
    func: async params => {
      // Fixed read-only endpoint. Credentials remain in this browser; never return cookies or tokens.
      const body = document.body?.innerText || '';
      if (/请完成验证|请先完成安全验证|访问异常|账号异常/.test(body)) return { error: 'BOSS 需要人工验证，请在 BOSS 标签页完成后重新搜索。' };
      try {
        const response = await fetch(`/wapi/zpgeek/search/joblist.json?${new URLSearchParams(params)}`, {
          credentials: 'include', signal: AbortSignal.timeout(20000),
        });
        if (!response.ok) return { error: response.status === 429
          ? 'BOSS 提示请求过于频繁（HTTP 429），已暂停读取，请勿连续重试。'
          : `BOSS 列表请求未成功（HTTP ${response.status}），已暂停读取，请查看 BOSS 页面提示。` };
        const data = await response.json();
        if (data?.code !== 0) {
          if (data?.code === 37 && typeof data.message === 'string' && /环境.*异常/.test(data.message)) {
            return { error: `BOSS 提示当前访问环境异常（HTTP ${response.status}，业务码 37），列表读取已暂停，请查看 BOSS 页面提示，勿连续重试。` };
          }
          const code = Number.isSafeInteger(data?.code) ? `，业务码 ${data.code}` : '，缺少有效业务码';
          return { error: `BOSS 列表请求未成功（HTTP ${response.status}${code}），已暂停读取，请查看 BOSS 页面提示。` };
        }
        if (!Array.isArray(data.zpData?.jobList)) return { error: 'BOSS 岗位数据格式变化，已停止读取。' };
        // Do not relay unrelated account/HR information back to the product.
        const fields = ['encryptJobId', 'jobName', 'brandName', 'salaryDesc', 'salary', 'cityName', 'areaDistrict',
          'jobDegree', 'jobExperience', 'brandIndustry', 'brandNatureName', 'jobType', 'jobTypeName',
          'graduateYear', 'applicationDeadline', 'publishTime', 'updateTime', 'postDescription', 'daysPerWeekDesc', 'leastMonthDesc', 'jobUrl', 'url', 'securityId', 'lid'];
        return { jobs: data.zpData.jobList.map(job => ({ ...Object.fromEntries(fields.filter(key =>
          ['string', 'number'].includes(typeof job[key])).map(key => [key, job[key]])),
          jobLabels: Array.isArray(job.jobLabels) ? job.jobLabels.filter(value => typeof value === 'string') : [] })),
          hasMore: typeof data.zpData.hasMore === 'boolean' ? data.zpData.hasMore : null };
      } catch { return { error: 'BOSS 请求超时或连接中断，请检查 BOSS 标签页后重试。' }; }
    },
  });
  const payload = results[0]?.result;
  if (!payload || payload.error) throw new Error(payload?.error || 'BOSS 页面未返回岗位数据。');
  return payload;
}

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message?.channel === 'knowvia-boss-chat-updated' && sender.id === chrome.runtime.id && sender.frameId === 0
    && /^https:\/\/www\.zhipin\.com\/web\/geek\/chat(?:[/?#]|$)/.test(sender.url || '')) {
    for (const [websiteId, session] of chatSessions) {
      if (session.tabId === sender.tab?.id)
        void chrome.tabs.sendMessage(websiteId, { channel: 'knowvia-boss-chat-updated' }).catch(() => {});
    }
    return false;
  }
  if (!authorizedSender(sender, chrome.runtime.id) || message?.channel !== 'knowvia-jobs-request' || message.version !== 1) return false;
  if (['AUTOFILL_START', 'AUTOFILL_STATUS', 'AUTOFILL_CANCEL', 'AUTOFILL_FOCUS'].includes(message.command)) {
    officialAutofill.handle(message.command, sender, message.payload)
      .then(data => reply({ ok: true, data }), error => reply({ ok: false, error: error.message || '官网填写任务失败，请重试。' }));
    return true;
  }
  const key = sender.tab.id;
  const pendingRead = pendingChatReads.get(key);
  if (message.command === 'READ_BOSS_CHAT' && pendingRead) {
    pendingRead.then(data => reply({ ok: true, data }), error => reply({ ok: false, error: error.message || '聊天记录读取失败，请重试。' }));
    return true;
  }
  if (['OPEN_JOB', 'JOB_OPEN_STATUS', 'FOCUS_JOB'].includes(message.command)) {
    const run = async () => {
      if (message.command === 'JOB_OPEN_STATUS') return navigation.status(sender, message.payload);
      if (message.command === 'FOCUS_JOB') return navigation.focus(sender, message.payload);
      jobDestination(message.payload);
      if (openingJobs.size) throw new Error('正在打开岗位，请稍候。');
      if (readerTabId !== key && (inFlight.has(readerTabId) || (busyUntil.get(readerTabId) || 0) > Date.now()))
        throw new Error('另一个 Knowvia 页面正在读取岗位，请先停止该任务或等待完成。');
      openingJobs.add(key); pausedReaders.add(key); busyUntil.delete(key);
      try { return await navigation.open(sender, message.payload); }
      finally { openingJobs.delete(key); updater.flush(); }
    };
    run().then(data => reply({ ok: true, data })).catch(error => reply({ ok: false, error: error.message || '岗位未能打开，请重试。' }));
    return true;
  }
  const chatCommand = ['OPEN_BOSS_CHAT', 'READ_BOSS_CHAT', 'READ_BOSS_INBOX', 'READ_BOSS_APPLICATIONS', 'READ_BOSS_RESUMES', 'SELECT_BOSS_CONVERSATION', 'SEND_BOSS_MESSAGE', 'SEND_BOSS_RESUME'].includes(message.command);
  const exclusive = message.command !== 'PING' && !chatCommand;
  if (exclusive && openingJobs.size) { reply({ ok: false, error: '正在打开岗位，后台读取已暂停。' }); return false; }
  if (pausedReaders.has(key) && ['FETCH_PAGE', 'FETCH_DETAIL', 'READ_METADATA'].includes(message.command)) {
    reply({ ok: false, error: '查看岗位期间后台读取已暂停，请在官网明确恢复读取。' }); return false;
  }
  const readerBusy = inFlight.has(readerTabId) || (busyUntil.get(readerTabId) || 0) > Date.now();
  if (exclusive && readerBusy && readerTabId !== key) {
    reply({ ok: false, error: '另一个 Knowvia 页面正在读取岗位，请先停止该任务或等待完成。' });
    return false;
  }
  if (exclusive && inFlight.size) { reply({ ok: false, error: '上一次平台操作尚未结束，请稍后重试。' }); return false; }
  if (exclusive) {
    if (message.command === 'PREPARE') pausedReaders.delete(key);
    inFlight.add(key);
    if (['PREPARE', 'FETCH_PAGE', 'FETCH_DETAIL', 'READ_METADATA'].includes(message.command)) {
      readerTabId = key;
      busyUntil.set(key, Date.now() + 45000);
    }
  }
  const operation = handle(message, sender);
  if (chatCommand) activeChatRequests.add(operation);
  if (message.command === 'READ_BOSS_CHAT') pendingChatReads.set(key, operation);
  operation.then(data => reply({ ok: true, data }))
    .catch(error => reply({ ok: false, error: error.message || '扩展操作失败，请重新连接。' }))
    .finally(() => {
      activeChatRequests.delete(operation);
      if (pendingChatReads.get(key) === operation) pendingChatReads.delete(key);
      if (exclusive) inFlight.delete(key);
      updater.flush();
    });
  return true;
});
