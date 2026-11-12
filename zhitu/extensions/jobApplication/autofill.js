import { AUTOFILL_TTL, autofillRequest, officialDestination, matchesOfficialDestination, isOfficialLogin, isOfficialJobEntry } from './autofill-contract.js';
import { fillOfficialApplication } from './autofill-form.js';
import { ORIGINS } from './protocol.js';

const KEY = 'knowvia-official-autofill';
const TERMINAL = new Set(['filled', 'needs_attention', 'failed', 'cancelled']);
const publicTask = task => ({ taskId: task.taskId, state: task.state,
  jobs: task.jobs.map(({ jobId, title, company, state, message, fields, target }) => ({ jobId, title, company, state, message, fields,
    ...(target ? { system: target.system || 'moka' } : {}) })) });

// Session storage survives service-worker suspension and is not exposed to web pages.
export function createOfficialAutofill(browser, { now = Date.now } = {}) {
  let queue = Promise.resolve();
  let active = 0;
  let running = false;
  let initialized = false;
  const interrupted = new Set();
  const serial = action => {
    const result = queue.then(action);
    queue = result.catch(() => {});
    return result;
  };
  const read = async () => {
    const tasks = (await browser.storage.session.get(KEY))[KEY] || [];
    running = tasks.some(task => task.state === 'running' && now() < task.expiresAt);
    initialized = true;
    return tasks;
  };
  const write = async tasks => {
    running = tasks.some(task => task.state === 'running');
    await browser.storage.session.set({ [KEY]: tasks });
  };
  async function stopDocument(task, job) {
    if (!job.tabId) return;
    await browser.scripting.executeScript({ target: { tabId: job.tabId, ...(job.documentId ? { documentIds: [job.documentId] } : {}) },
      func: taskId => { globalThis.__knowviaAutofillCancelled = taskId; }, args: [task.taskId] }).catch(() => {});
  }
  async function cancelTask(task, message) {
    task.state = 'cancelled';
    delete task.profile;
    for (const job of task.jobs) {
      if (!TERMINAL.has(job.state)) {
        job.state = 'cancelled'; job.message = message;
        await stopDocument(task, job);
      }
    }
  }
  async function interruptTask(task) {
    if (task.state !== 'running') return;
    interrupted.add(task.taskId);
    await Promise.allSettled(task.jobs.filter(job => !TERMINAL.has(job.state)).map(job => stopDocument(task, job)));
  }
  async function interruptOwner(tabId) {
    const tasks = await read();
    await Promise.allSettled(tasks.filter(task => task.ownerTabId === tabId).map(interruptTask));
  }
  async function ownerAlive(task) {
    try {
      const tab = await browser.tabs.get(task.ownerTabId);
      return new URL(tab.url).origin === task.ownerOrigin && ORIGINS.has(task.ownerOrigin) && Boolean(tab.incognito) === task.incognito;
    } catch { return false; }
  }
  async function observe(task, job, persist) {
    try {
      if (!job.tabId) {
        const opened = await browser.tabs.create({ url: job.target.url, active: true,
          openerTabId: task.ownerTabId, windowId: task.windowId });
        job.tabId = opened.id;
        job.openedAt = now();
        return;
      }
      const tab = await browser.tabs.get(job.tabId);
      if (Boolean(tab.incognito) !== task.incognito) throw new Error('浏览器窗口身份已改变。');
      const address = tab.pendingUrl || tab.url || '';
      if (address === 'about:blank' || tab.pendingUrl || tab.status !== 'complete') {
        job.navigationWaitingSince ??= now();
        if (now() - job.navigationWaitingSince > 60000) throw new Error('官网表单加载超时或布局尚未适配，请查看官网页面。');
        return;
      }
      delete job.navigationWaitingSince;
      if (!matchesOfficialDestination(address, job.target)) {
        if (isOfficialLogin(address, job.target)) {
          job.state = 'waiting_login'; job.message = '请在企业官网完成登录或验证，完成后自动继续。';
          delete job.formWaitingSince;
          return;
        }
        if (isOfficialJobEntry(address, job.target) && (job.returnNavigations || 0) < 2) {
          job.returnNavigations = (job.returnNavigations || 0) + 1;
          job.state = 'opening'; job.message = '正在进入该岗位的官网申请表。';
          await browser.tabs.update(job.tabId, { url: job.target.url });
          return;
        }
        throw new Error('官网已离开所选企业或岗位，请重新发起。');
      }
      job.state = 'filling';
      const probe = (await browser.scripting.executeScript({ target: { tabId: job.tabId },
        func: matchesOfficialDestination, args: [null, job.target] }))[0];
      if (!probe?.result || !probe.documentId) throw new Error('document');
      job.documentId = probe.documentId;
      await persist();
      if (interrupted.has(task.taskId)) { job.state = 'cancelled'; job.message = '填写已停止。'; return; }
      const results = await browser.scripting.executeScript({ target: { tabId: job.tabId, documentIds: [probe.documentId] },
        func: fillOfficialApplication, args: [{ taskId: task.taskId, target: job.target, profile: task.profile, expiresAt: task.expiresAt }] });
      if (interrupted.has(task.taskId)) { job.state = 'cancelled'; job.message = '填写已停止。'; return; }
      const result = results.find(item => item.documentId === probe.documentId)?.result;
      if (!result) throw new Error('官网表单尚未返回结果。');
      if (result.state === 'waiting_login' || result.state === 'waiting_form') {
        job.state = result.state;
        job.message = result.state === 'waiting_login'
          ? '请在企业官网完成登录或验证，完成后自动继续。' : '正在等待官网表单加载。';
        if (result.state === 'waiting_login') delete job.formWaitingSince;
        else job.formWaitingSince ??= now();
        if (result.state === 'waiting_form' && now() - job.formWaitingSince > 60000)
          throw new Error('官网表单加载超时或布局尚未适配，请查看官网页面。');
        return;
      }
      if (result.state === 'cancelled') { job.state = 'cancelled'; job.message = '填写已停止。'; return; }
      if (!['filled', 'needs_attention'].includes(result.state) || !Array.isArray(result.fields))
        throw new Error('官网表单返回了无效结果。');
      job.fields = result.fields;
      job.state = result.state;
      job.message = job.state === 'filled' ? '已填写并回读核验，请在官网查看。' : '已填写可确定字段，部分项目需要处理。';
    } catch (error) {
      job.state = 'failed';
      job.message = error?.message === 'No tab with id' ? '官网标签页已关闭。' : '官网填写未完成，请检查标签页或重新发起。';
      // Only our fixed messages may cross the bridge. Browser errors may contain URLs or page values.
      if (['官网已离开所选企业或岗位，请重新发起。', '官网表单加载超时或布局尚未适配，请查看官网页面。'].includes(error?.message))
        job.message = error.message;
    }
  }
  async function tickTasks(tasks) {
    active++;
    try {
      for (const task of tasks) {
        if (task.state !== 'running') continue;
        if (interrupted.has(task.taskId) || now() >= task.expiresAt || !await ownerAlive(task)) {
          await cancelTask(task, '任务已过期或发起页面已关闭。');
          continue;
        }
        // One destination runs at a time. The next starts after its predecessor has a final receipt.
        const job = task.jobs.find(item => !TERMINAL.has(item.state));
        if (job) await observe(task, job, () => write(tasks));
        if (interrupted.has(task.taskId)) await cancelTask(task, '填写已停止。');
        else if (task.jobs.every(item => TERMINAL.has(item.state))) { task.state = 'finished'; delete task.profile; }
      }
      await write(tasks.filter(task => now() < task.expiresAt));
    } finally { active--; }
  }
  const tick = () => serial(async () => tickTasks(await read()));
  void read().catch(() => {});
  function lookup(tasks, sender, input) {
    const task = tasks.find(item => item.taskId === input?.taskId && item.ownerTabId === sender.tab.id
      && item.ownerOrigin === new URL(sender.url || sender.tab.url).origin);
    if (!task) throw new Error('填写任务已结束或属于其他页面，请重新发起。');
    return task;
  }
  return {
    busy: () => !initialized || active > 0 || running,
    tick,
    interruptOwner,
    handle(command, sender, input) {
      // A cancellation must reach the isolated script while its awaited fill is still running.
      const prepare = async () => {
        if (command === 'AUTOFILL_START') {
          const request = autofillRequest(input);
          const tasks = await read();
          const origin = new URL(sender.url || sender.tab.url).origin;
          if (!tasks.some(task => task.taskId === request.operationId && task.ownerTabId === sender.tab.id && task.ownerOrigin === origin))
            await interruptOwner(sender.tab.id);
        }
        if (command === 'AUTOFILL_CANCEL') {
          const task = lookup(await read(), sender, input);
          await interruptTask(task);
        }
      };
      return prepare().then(() => serial(async () => {
        const tasks = (await read()).filter(task => now() < task.expiresAt);
        if (command === 'AUTOFILL_START') {
          const request = autofillRequest(input);
          const previous = tasks.find(task => task.taskId === request.operationId && task.ownerTabId === sender.tab.id
            && task.ownerOrigin === new URL(sender.url || sender.tab.url).origin);
          if (previous) return publicTask(previous);
          for (const task of tasks.filter(item => item.ownerTabId === sender.tab.id && item.state === 'running'))
            await cancelTask(task, '已由新的填写任务替代。');
          const task = { taskId: request.operationId, ownerId: request.ownerId, resumeId: request.resumeId,
            revision: request.revision, profile: request.profile, ownerTabId: sender.tab.id,
            ownerOrigin: new URL(sender.url || sender.tab.url).origin,
            incognito: Boolean(sender.tab.incognito), windowId: sender.tab.windowId,
            expiresAt: now() + AUTOFILL_TTL, state: 'running', jobs: request.jobs.map(job => {
              try { return { ...job, target: officialDestination(job.jobUrl), state: 'opening', message: '正在打开官网申请表。', fields: [], openedAt: now() }; }
              catch (error) { return { ...job, state: 'failed', message: error.message, fields: [] }; }
            }) };
          if (task.jobs.every(job => TERMINAL.has(job.state))) { task.state = 'finished'; delete task.profile; }
          tasks.push(task);
          await write(tasks);
          // Start only after persistence, so navigation events cannot race task creation.
          void tick().catch(() => {});
          return publicTask(task);
        }
        const task = lookup(tasks, sender, input);
        if (command === 'AUTOFILL_CANCEL') { await cancelTask(task, '填写已取消。'); await write(tasks); }
        else if (command === 'AUTOFILL_FOCUS') {
          const job = task.jobs.find(item => item.jobId === input.jobId);
          if (job?.tabId) await browser.tabs.update(job.tabId, { active: true }).catch(() => {});
        } else if (command === 'AUTOFILL_STATUS') await tickTasks(tasks);
        else throw new Error('填写命令无效。');
        return publicTask(task);
      }));
    },
    forget(tabId) {
      return interruptOwner(tabId).then(() => serial(async () => {
        const tasks = await read();
        for (const task of tasks) {
          if (task.ownerTabId === tabId) await cancelTask(task, '发起页面已关闭。');
          else for (const job of task.jobs.filter(job => job.tabId === tabId && !TERMINAL.has(job.state))) {
            job.state = 'failed'; job.message = '官网标签页已关闭。';
          }
          if (task.state === 'running' && task.jobs.every(job => TERMINAL.has(job.state))) {
            task.state = 'finished'; delete task.profile;
          }
        }
        await write(tasks.filter(task => task.ownerTabId !== tabId && now() < task.expiresAt));
      }));
    },
  };
}
