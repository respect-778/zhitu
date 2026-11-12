// Only the local Knowvia development/test origins can use this bridge.
(() => {
  const origins = ['http://127.0.0.1:5174', 'http://localhost:5174', 'http://127.0.0.1:5186', 'http://localhost:5186', 'http://127.0.0.1:5197'];
  if (window !== window.top || !origins.includes(location.origin)) return;
  // A reloaded extension reconnects existing website tabs without refreshing them.
  // Remove the old, invalidated listener before installing the replacement.
  const replaced = 'knowvia-jobs-bridge-replaced';
  document.dispatchEvent(new Event(replaced));
  const commands = new Set(['PING', 'OPEN_BOSS', 'OPEN_ZHAOPIN', 'OPEN_LIEPIN', 'PREPARE', 'FETCH_PAGE', 'FETCH_DETAIL', 'READ_METADATA',
    'OPEN_BOSS_CHAT', 'READ_BOSS_CHAT', 'READ_BOSS_INBOX', 'READ_BOSS_APPLICATIONS', 'READ_BOSS_RESUMES', 'SELECT_BOSS_CONVERSATION', 'SEND_BOSS_MESSAGE', 'SEND_BOSS_RESUME', 'OPEN_JOB', 'JOB_OPEN_STATUS', 'FOCUS_JOB',
    'AUTOFILL_START', 'AUTOFILL_STATUS', 'AUTOFILL_CANCEL', 'AUTOFILL_FOCUS']);
  const receive = async event => {
    const message = event.data;
    if (event.source !== window || event.origin !== location.origin || message?.channel !== 'knowvia-jobs-request'
      || message.version !== 1 || typeof message.id !== 'string' || message.id.length > 80 || !commands.has(message.command)) return;
    let response;
    try { response = await chrome.runtime.sendMessage(message); }
    catch { response = { ok: false, error: '浏览器助手正在重新连接，请稍后再试。' }; }
    window.postMessage({ channel: 'knowvia-jobs-response', version: 1, id: message.id, ...response }, location.origin);
  };
  window.addEventListener('message', receive);
  const updated = message => {
    if (message?.channel === 'knowvia-boss-chat-updated')
      window.postMessage({ channel: 'knowvia-boss-chat-updated', version: 1 }, location.origin);
  };
  chrome.runtime.onMessage.addListener(updated);
  document.addEventListener(replaced, () => {
    window.removeEventListener('message', receive);
    chrome.runtime.onMessage.removeListener(updated);
  }, { once: true });
  window.postMessage({ channel: 'knowvia-jobs-ready', version: 1 }, location.origin);
})();
