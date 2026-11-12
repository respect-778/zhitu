// BOSS's own attachment chooser uses this read-only endpoint with from=2.
// Return metadata only; file URLs, document bytes and cookies stay on BOSS.
export async function readBossResumes(input) {
  try {
    const account = () => String(globalThis._PAGE?.userId || globalThis._PAGE?.uid || '');
    if (location.origin !== 'https://www.zhipin.com' || !input?.accountId
      || account() !== input.accountId) throw new Error('BOSS 账号已变化，请刷新会话后读取附件。');
    const response = await fetch('/wapi/zpgeek/resume/attachment/checkbox.json?from=2', {
      credentials: 'include', signal: AbortSignal.timeout(12000), headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`BOSS 附件读取失败（HTTP ${response.status}）。`);
    const data = await response.json();
    if (account() !== input.accountId) throw new Error('BOSS 账号已变化，请重新读取附件。');
    if (data?.code !== 0) throw new Error(typeof data?.message === 'string' ? data.message : 'BOSS 暂未返回附件列表。');
    if (!Array.isArray(data.zpData?.resumeList)) throw new Error('BOSS 附件列表格式已变化，暂未读取。');
    const resumes = data.zpData.resumeList.map(row => {
      const id = row?.resumeId || row?.encryptId;
      const name = row?.showName || row?.customName || row?.originalName;
      if (typeof id !== 'string' || !id || id.length > 200 || typeof name !== 'string' || !name)
        throw new Error('BOSS 附件信息不完整，请刷新附件列表。');
      return { id, name, size: typeof row.resumeSizeDesc === 'string' ? row.resumeSizeDesc : '',
        updatedAt: typeof row.uploadTime === 'string' ? row.uploadTime : '',
        kind: row.annexType === 1 ? 'portfolio' : 'resume', restricted: Boolean(row.restricted),
        restriction: typeof row.restrictedLabel === 'string' ? row.restrictedLabel : '' };
    });
    if (new Set(resumes.map(row => row.id)).size !== resumes.length) throw new Error('BOSS 附件标识重复，请重新读取。');
    return { accountId: input.accountId, resumes };
  } catch (error) { return { error: error.message || '附件列表读取失败，请重试。' }; }
}
