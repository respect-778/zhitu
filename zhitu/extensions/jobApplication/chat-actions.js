// Executed in the platform's main world, using its existing editor and resume controls.
export async function performBossChatAction(input) {
  try {
    const text = element => (element?.innerText || element?.textContent || '').trim();
    const visible = element => element && element.getBoundingClientRect().width > 0
      && getComputedStyle(element).visibility !== 'hidden';
    const messageText = element => {
      // Native .text also contains delivery status and quoted messages.
      const content = element.querySelector('.text > p > .text-content');
      if (content) return text(content);
      const body = element.querySelector('.text, .message-text')?.cloneNode(true);
      body?.querySelectorAll('.message-status, .read-status').forEach(node => node.remove());
      return text(body);
    };
    function assertRecipient() {
      const account = String(globalThis._PAGE?.userId || globalThis._PAGE?.uid || '');
      const list = document.querySelector('.user-list');
      const row = [...(list?.querySelectorAll('li') || [])]
        .find(element => element.dataset.knowviaConversation === input.conversationId);
      const selected = row?.querySelector('.friend-content') || row;
      if (location.origin !== 'https://www.zhipin.com' || !/^\/web\/geek\/chat(?:\/|$)/.test(location.pathname)
        || account !== input.accountId || list?.dataset.knowviaSession !== input.sessionId
        || !row || !selected?.matches('.selected, .active, [aria-selected="true"], [aria-current="true"]')
        || text(row.querySelector('.name-text, .user-name')) !== input.recipient.name
        || text(row.querySelector('.company-name, .company-text, .title-box .name-box > span:nth-of-type(2)')) !== input.recipient.company
        || text(row.querySelector('.job-name, .job-title')) !== input.recipient.jobTitle)
        throw new Error('当前账号或收件会话已变化，请重新选择后发送。');
      return document.querySelector('.chat-conversation') || [...document.querySelectorAll('.chat-content')]
        .find(element => !element.contains(list));
    }
    const panel = assertRecipient();
    if (!panel) throw new Error('BOSS 聊天窗口尚未就绪。');
    let ledger = globalThis.__knowviaChatActions;
    if (!ledger || ledger.sessionId !== input.sessionId || ledger.accountId !== input.accountId)
      globalThis.__knowviaChatActions = ledger = { sessionId: input.sessionId, accountId: input.accountId, operations: new Map() };
    const fingerprint = JSON.stringify([input.accountId, input.action, input.conversationId, input.content, input.resumeId]);
    const prior = ledger.operations.get(input.operationId);
    if (prior) {
      if (prior.fingerprint !== fingerprint) throw new Error('发送操作标识已被使用，请刷新后核对。');
      return await prior.promise;
    }
    const promise = run();
    ledger.operations.set(input.operationId, { fingerprint, promise });
    return await promise;

    async function run() {
      const before = new Set(panel.querySelectorAll('.message-item'));
      let committed = false;
      let confirmClicked = false;
      let originalDraft = '';
      let submittedDraft = '';
      let originalNodes = [];
      let editor;
      let resumeControl;
      let resumeVm;
      let chosenRow;
      const outcome = (status, message) => ({ operationId: input.operationId,
        conversationId: input.conversationId, status, message });
      try {
        if (input.action === 'message') {
          editor = panel.querySelector('#chat-input, [contenteditable="true"], textarea');
          const button = panel.querySelector('.btn-send, button[type="send"]');
          if (!visible(editor) || !visible(button)) throw new Error('未找到 BOSS 消息编辑器，请在平台检查会话。');
          originalDraft = editor.value ?? editor.innerText ?? editor.textContent ?? '';
          originalNodes = [...editor.childNodes].map(node => node.cloneNode(true));
          editor.focus();
          if (editor.isContentEditable) {
            const range = document.createRange(); range.selectNodeContents(editor);
            const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
            if (!document.execCommand('insertText', false, input.content)) editor.textContent = input.content;
          } else {
            const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(editor), 'value')?.set;
            if (setter) setter.call(editor, input.content);
            else editor.value = input.content;
          }
          editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: input.content }));
          editor.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Unidentified' }));
          submittedDraft = editor.value ?? editor.innerText ?? editor.textContent ?? '';
          // The native editor debounces its input observer before enabling send.
          // Wait for that state transition, never bypass the platform's disabled state.
          await new Promise((resolve, reject) => {
            const observer = new MutationObserver(inspect);
            const timer = setTimeout(() => finish(new Error('BOSS 发送按钮尚未就绪，请检查平台提示或消息长度后重试。')), 8000);
            function finish(error) {
              observer.disconnect(); clearTimeout(timer);
              if (error) reject(error); else resolve();
            }
            function inspect() {
              try {
                const currentPanel = assertRecipient();
                if (currentPanel !== panel || !editor.isConnected || !button.isConnected)
                  throw new Error('BOSS 消息编辑器已变化，请重新选择会话。');
                const current = editor.value ?? editor.innerText ?? editor.textContent ?? '';
                if (current !== submittedDraft)
                  throw new Error('BOSS 输入内容已变化，本次未发送，请核对草稿。');
                if (visible(button) && !button.disabled && !button.classList.contains('disabled')) finish();
              } catch (error) { finish(error); }
            }
            observer.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
            inspect();
          });
          assertRecipient();
          if (button.disabled || button.classList.contains('disabled')) throw new Error('BOSS 当前不允许发送，请查看平台提示。');
          committed = true;
          button.click();
        } else {
          resumeControl = [...panel.querySelectorAll('.toolbar-btn, button, [role="button"]')]
            .find(element => visible(element) && text(element) === '发简历');
          if (!resumeControl) throw new Error('当前会话未显示 BOSS 发简历入口。');
          resumeVm = resumeControl.closest('.toolbar-btn-content')?.__vue__;
          if (!resumeVm) throw new Error('BOSS 简历控件尚未就绪，请刷新会话后重试。');
          // Native mouseenter runs checkStatus: BOSS itself expires old local requests.
          // Do not clear its state or bypass an active request.
          resumeControl.dispatchEvent(new MouseEvent('mouseenter'));
          await resumeVm.$nextTick?.();
          assertRecipient();
          if (resumeVm.conversation$?.requestResume)
            return outcome('resume_pending', 'BOSS 显示本会话已有附件请求，正在等待 HR 同意。本次所选附件未重新发送。');
          if (resumeControl.classList.contains('unable') || resumeControl.disabled)
            throw new Error(resumeControl.getAttribute('aria-label') || 'BOSS 暂不允许向此会话发送简历。');
          if (!input.resume || input.resume.id !== input.resumeId || input.resume.restricted)
            throw new Error('请先在工作台选择可发送的 BOSS 附件。');
          if ([...document.querySelectorAll('.panel-resume, .choose-resume-dialog')].some(visible))
            throw new Error('BOSS 已有未结束的简历选择，请关闭该弹窗后重试。');
          resumeControl.click();
        }
        return await new Promise(resolve => {
          const observer = new MutationObserver(inspect);
          const timer = setTimeout(() => finish(outcome(committed ? 'unknown' : 'failed', committed
            ? '操作已提交，平台结果尚未确认。请刷新会话核对，勿重复发送。'
            : 'BOSS 未完成附件选择，请刷新附件后重试；本次未确认发送。')), 8000);
          function finish(result) { clearTimeout(timer); observer.disconnect(); resolve(result); }
          function inspect() {
            try {
              assertRecipient();
              const nodes = [...panel.querySelectorAll('.message-item')].filter(node => !before.has(node));
              const own = nodes.find(node => node.classList.contains('item-myself')
                && (input.action === 'resume' ? isSelectedResume(node) : messageText(node) === input.content.trim()));
              if (own?.querySelector('.status-error')) return finish(outcome('failed', 'BOSS 显示发送失败，消息草稿已保留。'));
              if (own?.querySelector('.status-delivery, .status-read'))
                return finish(outcome(input.action === 'message' ? 'sent' : 'resume_sent', input.action === 'message' ? '消息已送达。' : '简历已发送。'));
              if (input.action === 'resume') {
                if (confirmClicked && resumeVm.resumeId === input.resumeId && resumeVm.conversation$?.requestResume)
                  return finish(outcome('resume_requested', '附件发送请求已提交，等待 HR 同意。'));
                if (!confirmClicked) confirmResume();
              }
            } catch (error) { finish(outcome(committed ? 'unknown' : 'failed', error.message)); }
          }
          observer.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
          inspect();
        });
      } catch (error) {
        return outcome(committed ? 'unknown' : 'failed', error.message || '发送未完成，请核对平台。');
      } finally {
        // Restore a pre-existing native draft only while the same recipient is still selected.
        if (editor) {
          try {
            assertRecipient();
            const current = editor.value ?? editor.innerText ?? editor.textContent ?? '';
            if (!current || current === submittedDraft) {
              if (editor.isContentEditable) editor.replaceChildren(...originalNodes);
              else editor.value = originalDraft;
              editor.dispatchEvent(new Event('input', { bubbles: true }));
              editor.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Unidentified' }));
            }
          } catch {}
        }
      }
      function isSelectedResume(node) {
        if (!confirmClicked) return false;
        // A regular text message (even one with the same filename) is not an attachment receipt.
        return [node, ...node.querySelectorAll('*')].some(element => {
          const message = element.__vue__?.message;
          if (!message?.hyperLink?.url) return false;
          try {
            let url = new URL(message.hyperLink.url, location.origin);
            for (let depth = 0; depth < 2; depth++) {
              if (url.searchParams.get('encryptResumeId') === input.resumeId) return true;
              const nested = url.searchParams.get('url');
              if (!nested) break;
              url = new URL(nested, location.origin);
            }
          } catch {}
          return false;
        });
      }
      function confirmResume() {
        assertRecipient();
        // BOSS nests .choose-resume-dialog wrappers. The inner chooser owns the list/selection.
        const chooser = [...document.querySelectorAll('.choose-resume-dialog')]
          .find(element => visible(element) && Array.isArray(element.__vue__?.resumeList));
        if (chooser) {
          const vm = chooser.__vue__;
          const index = vm.resumeList.findIndex(row => (row.resumeId || row.encryptId) === input.resumeId);
          const item = vm.resumeList[index];
          if (!item || item.restricted) throw new Error('所选附件已变化或不可发送，请重新读取附件。');
          const rows = chooser.querySelectorAll('.resume-list > .list-item');
          if (rows.length !== vm.resumeList.length || !rows[index]) throw new Error('BOSS 附件选择列表已变化，本次未发送。');
          if (vm.resumeId !== input.resumeId) {
            if (chosenRow) throw new Error('附件选择已被更改，本次未发送。');
            chosenRow = rows[index]; chosenRow.click();
            // Vue updates the button in its next render; the observer resumes then.
            return;
          }
          const button = chooser.querySelector('.btn-confirm');
          if (!visible(button) || button.disabled || button.classList.contains('disabled')) return;
          assertRecipient(); confirmClicked = true; committed = true; button.click();
          return;
        }
        const panel = [...resumeControl.closest('.toolbar-btn-content').querySelectorAll('.panel-resume')].find(visible);
        if (panel) {
          if (resumeVm.resumeId !== input.resumeId || resumeVm.info?.alertType === 8)
            throw new Error('BOSS 当前附件或发送条件已变化，请重新读取附件。');
          const buttons = [...panel.querySelectorAll('button, .btn-sure-v2, .btn-confirm')]
            .filter(element => visible(element) && /^(确定|发送|确认发送)$/.test(text(element)));
          if (buttons.length !== 1 || buttons[0].disabled || buttons[0].classList.contains('disabled')) return;
          assertRecipient(); confirmClicked = true; committed = true; buttons[0].click();
        }
      }

    }
  } catch (error) { return { error: error.message || '发送操作失败。' }; }
}
