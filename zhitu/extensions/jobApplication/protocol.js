export const ORIGINS = new Set(['http://127.0.0.1:5174', 'http://localhost:5174', 'http://127.0.0.1:5186', 'http://localhost:5186', 'http://127.0.0.1:5197']);
export function authorizedSender(sender, extensionId) {
  try {
    return sender.id === extensionId && Number.isInteger(sender.tab?.id) && sender.frameId === 0
      && ORIGINS.has(new URL(sender.url).origin) && ORIGINS.has(new URL(sender.tab.url).origin);
  } catch { return false; }
}
export function searchParameters(input) {
  if (!input || typeof input.keyword !== 'string' || !input.keyword.trim() || input.keyword.length > 100
    || !/^\d{9}$/.test(input.city) || !Number.isInteger(input.page) || input.page < 1 || input.page > 500)
    throw new Error('搜索参数无效，请重新搜索。');
  const params = { query: input.keyword.trim(), city: input.city, page: String(input.page), pageSize: '30' };
  if (['202', '203', '204', '205'].includes(input.degree)) params.degree = input.degree;
  if (input.job_type === '实习') params.jobType = '1902';
  return params;
}

export function detailParameters(input) {
  if (!input || typeof input.jobId !== 'string' || !/^[\w-]{1,100}$/.test(input.jobId)
    || typeof input.securityId !== 'string' || input.securityId.length > 2000)
    throw new Error('岗位详情参数无效，请重新搜索。');
  const params = { jobId: input.jobId, securityId: input.securityId };
  for (const key of ['needsGraduation', 'needsDeadline']) {
    if (typeof input[key] === 'boolean') params[key] = input[key];
  }
  return params;
}

export function chatParameters(input) {
  const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  if (!input || !uuid.test(input.sessionId) || !uuid.test(input.conversationId)) {
    throw new Error('会话标识无效，请刷新会话列表后重试。');
  }
  return { operation: 'select', sessionId: input.sessionId, conversationId: input.conversationId };
}

export function chatActionParameters(input, action) {
  const target = chatParameters(input);
  if (typeof input.accountId !== 'string' || !/^[\w-]{1,100}$/.test(input.accountId)
    || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(input.operationId)
    || (action === 'message' && (typeof input.content !== 'string' || !input.content.trim() || input.content.length > 5000))
    || (action === 'resume' && (typeof input.resumeId !== 'string' || !input.resumeId || input.resumeId.length > 200)))
    throw new Error('发送内容或操作标识无效，请检查后重试。');
  return { ...target, accountId: input.accountId, operationId: input.operationId,
    action, content: action === 'message' ? input.content : '', ...(action === 'resume' ? { resumeId: input.resumeId } : {}) };
}
