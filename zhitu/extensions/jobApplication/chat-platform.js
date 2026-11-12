// Executed in BOSS's main world. Return account, conversation and native action state.
export async function readBossContext() {
  const control = [...document.querySelectorAll('.chat-conversation .toolbar-btn')]
    .find(element => element.textContent.trim() === '发简历');
  const vm = control?.closest('.toolbar-btn-content')?.__vue__;
  // The normal platform hover checks request expiry; it never sends an attachment.
  control?.dispatchEvent(new MouseEvent('mouseenter'));
  await vm?.$nextTick?.();
  const pending = Boolean(vm?.conversation$?.requestResume);
  const blocked = !control || !vm || control.classList.contains('unable') || control.disabled;
  const resumeState = pending ? 'pending' : blocked ? 'blocked' : 'available';
  const resumeReason = pending ? 'BOSS 显示已有附件请求，正在等待 HR 同意；当前不能再次发送或更换附件。'
    : blocked ? control?.getAttribute('aria-label') || 'BOSS 附件发送入口尚不可用，请刷新会话核对。' : '';
  const accountId = String(globalThis._PAGE?.userId || globalThis._PAGE?.uid || '');
  const conversations = [...document.querySelectorAll('.user-list li[data-knowvia-conversation]')].map(row => {
    const nodes = [row, ...row.querySelectorAll('.friend-content, .last-msg, .figure')];
    const boss = nodes.map(node => node.__vue__?.boss).find(value => value?.uniqueId);
    return {
      id: row.dataset.knowviaConversation,
      platformId: boss ? String(boss.uniqueId) : '',
      replyVersion: boss?.lastMsgId || boss?.lastTS ? `${boss.lastMsgId || boss.lastTS}:${boss.lastText || ''}` : '',
      lastIsHr: Boolean(boss && boss.lastIsSelf === false && boss.friendId > 1000 && !boss.groupId && !boss.tipType),
      unreadReply: Boolean(boss && boss.unreadCount > 0 && boss.lastIsSelf === false
        && boss.friendId > 1000 && !boss.groupId && !boss.tipType && boss.lastText),
      ...((row.querySelector('.friend-content') || row).matches('.selected, .active, [aria-selected="true"], [aria-current="true"]')
        ? { resumeState, resumeReason } : {}),
    };
  });
  return { accountId, conversations };
}

// Same read-only source used by BOSS's own “已投递” sidebar, including mobile activity.
export async function readBossApplications() {
  try {
    if (location.origin !== 'https://www.zhipin.com') throw new Error('BOSS 来源页面已变化，请重新连接。');
    const accountId = String(globalThis._PAGE?.userId || globalThis._PAGE?.uid || '');
    if (!/^[\w-]{1,100}$/.test(accountId)) throw new Error('无法确认当前 BOSS 账号，请完成登录后同步。');
    const response = await fetch('/wapi/zprelation/resume/geekDeliverList', {
      credentials: 'include', signal: AbortSignal.timeout(15000), headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`BOSS 投递记录读取失败（HTTP ${response.status}）。`);
    const data = await response.json();
    if (data?.code !== 0) throw new Error(typeof data?.message === 'string' ? data.message : 'BOSS 投递记录暂不可读取。');
    const rows = data.zpData?.cardList || data.zpData?.jobList;
    if (!Array.isArray(rows)) throw new Error('BOSS 投递记录格式已变化，请在平台核对。');
    if (accountId !== String(globalThis._PAGE?.userId || globalThis._PAGE?.uid || ''))
      throw new Error('BOSS 账号已切换，请重新同步投递记录。');
    const records = rows.map(row => {
      if (!row || typeof row.encryptJobId !== 'string' || !/^[\w-]{1,100}$/.test(row.encryptJobId)
        || typeof row.jobName !== 'string' || typeof row.brandName !== 'string')
        throw new Error('BOSS 投递记录字段已变化，请在平台核对。');
      return {
        jobId: row.encryptJobId, title: row.jobName, company: row.brandName,
        status: 'applied', evidence: 'boss-deliver-list',
        appliedAt: typeof row.deliverTime === 'string' ? row.deliverTime : '',
        resumeName: typeof row.resumeName === 'string' ? row.resumeName : '',
        url: `https://www.zhipin.com/job_detail/${row.encryptJobId}.html`,
      };
    });
    return { accountId, records, syncedAt: new Date().toISOString(),
      complete: data.zpData?.hasMore === false || data.zpData?.total === records.length };
  } catch (error) { return { error: error instanceof Error ? error.message : '投递记录读取失败。' }; }
}
