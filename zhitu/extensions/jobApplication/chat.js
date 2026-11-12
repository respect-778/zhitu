// DOM selectors follow the original automation.py chat reader. The state lives
// in the extension's isolated world and expires with this BOSS page.
export async function readBossChat(input = {}) {
  try {
    const visible = element => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    };
    const text = element => (element?.innerText || element?.textContent || '').trim();
    if (location.origin !== 'https://www.zhipin.com' || !/^\/web\/geek\/chat(?:\/|$)/.test(location.pathname)) {
      throw new Error('BOSS 聊天页已离开，请检查登录或验证提示后重新连接。');
    }
    const list = document.querySelector('.user-list, [class*="user-list_"], .friend-list, [class*="friend-list_"]');
    if (!list || !visible(list)) throw new Error('聊天列表尚未就绪，请在 BOSS 聊天页确认登录和页面加载情况后重试。');
    const stateKey = '__knowviaReadonlyChat';
    let state = globalThis[stateKey];
    if (!state || state.root !== list || state.version !== 6) {
      state?.cancelRead?.();
      state?.observer?.disconnect();
      state = { version: 6, root: list, sessionId: crypto.randomUUID(), ids: new WeakMap(), entries: new Map(), messageIds: new WeakMap(), readGeneration: 0 };
      globalThis[stateKey] = state;
    }
    state.cancelRead?.();
    const readGeneration = ++state.readGeneration;
    const selected = element => {
      const target = element.querySelector('.friend-content') || element;
      return target.getAttribute('aria-selected') === 'true'
        || target.getAttribute('aria-current') === 'true'
        || [...target.classList].some(name => /(?:^|[-_])(active|selected|cur)(?:[-_]|$)/.test(name));
    };
    function readConversations() {
      const entries = new Map();
      const conversations = [];
      const rows = [...list.querySelectorAll('li')].filter(element => visible(element)
        && !element.parentElement.closest('li'));
      for (const element of rows) {
        const name = text(element.querySelector('.name-text, .user-name, [class*="name-text_"], [class*="user-name_"]'));
        if (!name) continue;
        const company = text(element.querySelector('.company-name, .company-text, [class*="company-name_"], [class*="company-text_"]')
          || element.querySelector('.title-box .name-box > span:nth-of-type(2)'));
        const jobTitle = text(element.querySelector('.job-name, .job-title, [class*="job-name_"], [class*="job-title_"]'));
        const signature = JSON.stringify([name, company, jobTitle, text(element.querySelector('.title-box'))]);
        let id = state.ids.get(element);
        if (!id || state.entries.get(id)?.signature !== signature) {
          id = crypto.randomUUID();
          state.ids.set(element, id);
        }
        if (element.dataset.knowviaConversation !== id) element.dataset.knowviaConversation = id;
        const badge = element.querySelector('.notice-badge, .red-dot, [class*="unread"]');
        conversations.push({
          id, name,
          company, jobTitle,
          preview: text(element.querySelector('.last-message, .message-text, .last-msg, [class*="last-msg_"], [class*="last-message_"]')),
          time: text(element.querySelector('time, .time, [class*="time_"]')),
          unread: Boolean(badge && visible(badge)),
        });
        entries.set(id, { element, signature });
      }
      const explicitlyEmpty = /暂无(?:聊天|沟通|消息|联系人)|还没有(?:聊天|沟通|消息)|没有会话/.test(text(list));
      if (rows.length && !conversations.length && !explicitlyEmpty) throw new Error('BOSS 会话列表结构已变化，暂时无法读取。');
      if (!rows.length && !explicitlyEmpty) {
        throw new Error('会话列表仍在加载，请稍后重试。');
      }
      state.entries = entries;
      return conversations;
    }
    const panel = () => {
      const current = document.querySelector('.chat-conversation, [class*="chat-conversation_"]');
      if (current) return current;
      const legacy = document.querySelector('.chat-content, [class*="chat-content_"]');
      return legacy && !legacy.contains(list) ? legacy : null;
    };
    function messageElements() {
      return [...(panel()?.querySelectorAll('[class*="message-item"]') || [])]
        .filter(element => visible(element) && [...element.classList].some(name => /^message-item(?:_|$)/.test(name)))
        .filter((element, _index, elements) => !elements.some(parent => parent !== element && parent.contains(element)));
    }
    let conversations = readConversations();
    const activeElement = () => {
      const active = [...state.entries.values()].filter(entry => selected(entry.element));
      if (active.length > 1) throw new Error('无法确认当前会话，请在 BOSS 选择会话后刷新。');
      return active[0]?.element || null;
    };
    if (!state.observer) {
      state.observedActive = activeElement();
      state.lastElements = messageElements();
      state.pendingOldElements = new Set();
      state.observer = new MutationObserver(records => {
        const active = [...list.querySelectorAll('li')].find(element => selected(element)) || null;
        if (active !== state.observedActive) {
          state.lastElements.forEach(element => state.pendingOldElements.add(element));
          state.observedActive = active;
        }
        state.lastElements = messageElements();
        if (!state.notifying && globalThis.chrome?.runtime?.id && records.some(record =>
          list.contains(record.target) && !record.attributeName?.startsWith('data-knowvia'))) {
          state.notifying = true;
          queueMicrotask(() => {
            state.notifying = false;
            void chrome.runtime.sendMessage({ channel: 'knowvia-boss-chat-updated' }).catch(() => {});
          });
        }
      });
      state.observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
    }
    list.dataset.knowviaSession = state.sessionId;
    if (input.operation === 'inbox')
      return { sessionId: state.sessionId, conversations, selectedConversationId: null, messages: [] };
    const previousActive = activeElement();
    let targetElement = previousActive;
    let targetConversationId = [...state.entries.entries()].find(([, entry]) => entry.element === targetElement)?.[0] || null;
    if (input.operation === 'select') {
      if (input.sessionId !== state.sessionId) throw new Error('BOSS 聊天页已重新加载，请刷新会话列表。');
      const target = state.entries.get(input.conversationId);
      if (!target || !target.element.isConnected) throw new Error('会话列表已变化，请刷新后重新选择。');
      targetElement = target.element;
      targetConversationId = input.conversationId;
      if (!selected(target.element)) {
        messageElements().forEach(element => state.pendingOldElements.add(element));
        (target.element.querySelector('.friend-content') || target.element).click();
      }
    }
    let elements = [];
    if (targetElement) {
      let settledPanel;
      // Let the current DOM update finish. A posted task avoids background timer throttling.
      await new Promise(resolve => {
        const checkpoint = new MessageChannel();
        checkpoint.port1.onmessage = () => {
          checkpoint.port1.close();
          checkpoint.port2.close();
          resolve();
        };
        checkpoint.port2.postMessage(null);
      });
      await new Promise((resolve, reject) => {
        let targetSeen = false;
        let finished = false;
        const observer = new MutationObserver(inspect);
        const timer = setTimeout(() => finish(new Error('暂时无法确认消息已切换或加载完成，请在 BOSS 检查后重新读取。')), 8000);
        const cancel = () => finish(new Error('已开始新的聊天读取，请刷新会话。'));
        state.cancelRead = cancel;
        function finish(error) {
          if (finished) return;
          finished = true;
          observer.disconnect();
          clearTimeout(timer);
          if (state.cancelRead === cancel) delete state.cancelRead;
          if (error) reject(error);
          else resolve();
        }
        function inspect() {
          try {
            if (readGeneration !== state.readGeneration) throw new Error('已开始新的聊天读取，请刷新会话。');
            if (!targetElement.isConnected) throw new Error('会话列表已变化，请刷新后重新选择。');
            const active = activeElement();
            if (active === targetElement) targetSeen = true;
            else if (targetSeen || (active && active !== previousActive)) {
              throw new Error('BOSS 当前会话已变化，请重新读取会话列表。');
            }
            const currentPanel = panel();
            const currentElements = messageElements();
            const empty = !currentElements.length && /暂无聊天记录|暂无消息记录/.test(text(currentPanel));
            const oldMessagesRemain = currentElements.some(element => state.pendingOldElements.has(element));
            if (active === targetElement && currentPanel && !oldMessagesRemain && (currentElements.length || empty)) {
              elements = currentElements;
              settledPanel = currentPanel;
              finish();
            }
          } catch (error) { finish(error); }
        }
        observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
        inspect();
      });
      if (activeElement() !== targetElement || panel() !== settledPanel || !settledPanel?.isConnected) {
        throw new Error('暂时无法确认消息已切换或加载完成，请在 BOSS 检查后重新读取。');
      }
      elements = messageElements();
      if (elements.some(element => state.pendingOldElements.has(element))) throw new Error('当前会话正在切换，请重新读取。');
      state.pendingOldElements.clear();
      state.lastElements = elements;
      state.observedActive = targetElement;
    } else if (messageElements().length) {
      throw new Error('当前会话正在切换，请在 BOSS 加载完成后重新读取。');
    }
    conversations = readConversations();
    const active = [...state.entries.entries()].filter(([, entry]) => selected(entry.element));
    if (active.length > 1) throw new Error('无法确认当前会话，请在 BOSS 选择会话后刷新。');
    const selectedConversationId = active[0]?.[0] || null;
    if (targetElement && selectedConversationId !== targetConversationId) {
      throw new Error('会话身份已变化，请重新读取会话列表。');
    }
    const messages = [];
    if (selectedConversationId) {
      for (const element of elements) {
        const competitionPromotion = [...element.querySelectorAll('.message-card-wrap')].some(card => {
          const title = text(card.querySelector('.message-card-top-title')).replace(/\s+/g, '');
          return /^你与该职位竞争者PK情况$/i.test(title)
            && [...card.querySelectorAll('.message-card-buttons .card-btn')]
              .some(button => text(button) === '查看详细分析');
        });
        if (competitionPromotion) continue;
        const timeElement = element.querySelector('time, .message-time, .item-time .time, [class*="time_"], [class*="date_"]');
        const statusElement = element.querySelector('.read-status, .message-status, [class*="read-status_"]');
        const body = element.querySelector('.text > p > .text-content')
          || element.querySelector('.text, .text-wrap, .message-text, [class*="message-content_"], [class*="text-content_"]');
        let content = text(body);
        if (!body || body.querySelector('.read-status, .message-status')) {
          const clone = (body || element).cloneNode(true);
          clone.querySelectorAll('time, .message-time, .item-time, .read-status, .message-status, .avatar, .figure, button, [class*="time_"], [class*="date_"]').forEach(node => node.remove());
          content = text(clone);
        }
        if (!content && element.querySelector('img')) content = '[图片]';
        if (!content) continue;
        let id = state.messageIds.get(element);
        if (!id) { id = crypto.randomUUID(); state.messageIds.set(element, id); }
        const classes = [...element.classList];
        const system = element.classList.contains('item-system')
          || element.querySelector(':scope > .item-system, :scope > .message-content > .item-system');
        const sender = classes.some(name => /(?:^|[-_])(?:item-myself|myself|self)(?:[-_]|$)/.test(name)) ? 'me'
          : !system && classes.some(name => /(?:^|[-_])(?:item-friend|friend|other)(?:[-_]|$)/.test(name)) ? 'hr' : 'unknown';
        messages.push({ id, sender, content, time: text(timeElement), status: text(statusElement) });
      }
    }
    return { sessionId: state.sessionId, conversations, selectedConversationId, messages };
  } catch (failure) {
    if (input.returnErrors) return { error: failure instanceof Error ? failure.message : '聊天记录读取失败，请重试。' };
    throw failure;
  }
}
