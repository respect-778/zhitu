// Reuse the connection handshake: cached/database rows do not start another poller.
let jobNavigationSupported = false;
const navigationListeners = new Set<() => void>();
export const getJobNavigationSupport = () => jobNavigationSupported;
export const subscribeJobNavigationSupport = (listener: () => void) => {
  navigationListeners.add(listener);
  return () => { navigationListeners.delete(listener); };
};
function setJobNavigationSupport(supported: boolean) {
  if (jobNavigationSupported === supported) return;
  jobNavigationSupported = supported;
  navigationListeners.forEach(listener => listener());
}

export function bridge<T>(command: 'PING' | 'OPEN_BOSS' | 'OPEN_ZHAOPIN' | 'OPEN_LIEPIN' | 'PREPARE' | 'FETCH_PAGE' | 'FETCH_DETAIL' | 'READ_METADATA'
  | 'OPEN_BOSS_CHAT' | 'READ_BOSS_CHAT' | 'READ_BOSS_INBOX' | 'READ_BOSS_APPLICATIONS' | 'READ_BOSS_RESUMES' | 'SELECT_BOSS_CONVERSATION' | 'SEND_BOSS_MESSAGE' | 'SEND_BOSS_RESUME'
  | 'OPEN_JOB' | 'JOB_OPEN_STATUS' | 'FOCUS_JOB'
  | 'AUTOFILL_START' | 'AUTOFILL_STATUS' | 'AUTOFILL_CANCEL' | 'AUTOFILL_FOCUS', payload?: unknown): Promise<T> {
  if (typeof window === 'undefined' || typeof location === 'undefined')
    return Promise.reject(new Error('浏览器连接需要在官网页面中使用。'));
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const cleanup = () => { clearTimeout(timer); window.removeEventListener('message', receive) };
    const receive = (event: MessageEvent) => {
      if (event.source !== window || event.origin !== location.origin || event.data?.channel !== 'knowvia-jobs-response'
        || event.data.version !== 1 || event.data.id !== id) return;
      // Pre-0.4 content scripts cannot remove their listener on extension reload.
      // Ignore that invalidated context's reply so the freshly injected bridge can
      // answer the same request without forcing a website refresh or losing rows.
      if (!event.data.ok && typeof event.data.error === 'string'
        && /扩展连接已断开|助手正在重新连接/.test(event.data.error)) return;
      cleanup();
      if (command === 'PING') setJobNavigationSupport(Boolean(event.data.ok && event.data.data?.job_navigation === true && !event.data.data?.updating));
      if (event.data.ok) resolve(event.data.data as T);
      else reject(new Error(typeof event.data.error === 'string' ? event.data.error : '扩展连接异常，请刷新后重试。'));
    };
    const timer = setTimeout(() => { cleanup(); if (command === 'PING') setJobNavigationSupport(false); reject(new Error(command === 'PING'
      ? '请先在当前 Chrome 或 Edge 浏览器安装 Knowvia 岗位读取助手，再刷新本页。'
      : command.startsWith('AUTOFILL_') ? '官网填写助手连接超时，请检查扩展并重试。'
      : (payload as { platform?: string } | undefined)?.platform === 'liepin' ? '浏览器连接超时，请检查猎聘标签页后重试。'
      : (payload as { platform?: string } | undefined)?.platform === 'zhaopin' ? '浏览器连接超时，请检查智联标签页后重试。'
      : '浏览器连接超时，请检查 BOSS 标签页后重试。')) }, command === 'PING' ? 1200 : 35000);
    window.addEventListener('message', receive);
    window.postMessage({ channel: 'knowvia-jobs-request', version: 1, id, command, payload }, location.origin);
  });
}
