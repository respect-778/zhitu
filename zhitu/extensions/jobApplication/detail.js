// Passed intact to executeScript; no closure, arbitrary endpoint, or account data.
export async function readBossDetail({ jobId, securityId, needsGraduation = true, needsDeadline = true }) {
  const path = `/job_detail/${jobId}.html`;
  try {
    if (!securityId) return { error: '该岗位缺少详情访问参数，请重新搜索后补全。' };
    const response = await fetch(`/wapi/zpgeek/job/detail.json?${new URLSearchParams({ securityId })}`, {
      credentials: 'include', signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) return { error: response.status === 429
      ? 'BOSS 提示请求过于频繁（HTTP 429），已暂停读取，请勿连续重试。'
      : `BOSS 详情请求未成功（HTTP ${response.status}），已暂停读取。请查看 BOSS 页面提示。` };
    let data;
    try { data = await response.json(); }
    catch { return { error: `BOSS 详情返回格式异常（HTTP ${response.status}），已暂停读取。` }; }
    if (data?.code !== 0) {
      // Preserve the diagnostic code without relaying securityId, account fields,
      // or arbitrary response contents. A nonzero code does not prove logout.
      if (data?.code === 37 && typeof data.message === 'string' && /环境.*异常/.test(data.message)) {
        return { error: `BOSS 提示当前访问环境异常（HTTP ${response.status}，业务码 37），详情读取已暂停。请检查 BOSS 页面是否有验证提示，勿连续重试。` };
      }
      const code = Number.isSafeInteger(data?.code) ? `，业务码 ${data.code}` : '，缺少有效业务码';
      return { error: `BOSS 详情请求未成功（HTTP ${response.status}${code}），已暂停读取。请查看 BOSS 页面提示。` };
    }
    const job = data.zpData?.jobInfo;
    if (!job || job.encryptId !== jobId) return { error: '详情返回的岗位不一致，已停止补全。' };
    const fields = ['postDescription', 'jobType', 'jobTypeName', 'graduateYear', 'applicationDeadline'];
    const result = Object.fromEntries(fields.filter(key => ['string', 'number'].includes(typeof job[key]))
      .map(key => [key, job[key]]));
    if (Array.isArray(job.jobLabels)) result.jobLabels = job.jobLabels.filter(value => typeof value === 'string');
    // Only skip HTML when the requested metadata is already explicit and valid.
    const hasGraduation = /^(?:20\d{2}|\d{2})(?:届)?$/.test(String(result.graduateYear || '').trim());
    const deadline = String(result.applicationDeadline || '').trim();
    const date = deadline.match(/^(20\d{2})[-./年](\d{1,2})[-./月](\d{1,2})(?:日)?(?:$|T|\s)/);
    let hasDeadline = /^(?:长期有效|长期招聘|招满即止|招满为止|额满即止)$/.test(deadline);
    if (date) {
      const parsed = new Date(Date.UTC(Number(date[1]), Number(date[2]) - 1, Number(date[3])));
      hasDeadline = parsed.getUTCFullYear() === Number(date[1]) && parsed.getUTCMonth() + 1 === Number(date[2]) && parsed.getUTCDate() === Number(date[3]);
    }
    if ((!needsGraduation || hasGraduation) && (!needsDeadline || hasDeadline)) return result;
    try {
      const page = await fetch(`${path}?${new URLSearchParams({ securityId })}`, {
        credentials: 'include', signal: AbortSignal.timeout(12000),
      });
      if ([401, 403, 429].includes(page.status)) return { error: `BOSS 补充信息页拒绝访问（HTTP ${page.status}），已暂停读取，请查看 BOSS 页面提示，勿连续重试。` };
      if (new URL(page.url).origin !== location.origin || new URL(page.url).pathname !== path) {
        return { error: 'BOSS 详情转入其他页面，已暂停读取。请查看 BOSS 是否要求登录或验证。' };
      }
      if (!page.ok) throw new Error('detail page unavailable');
      const html = await page.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      if (/请完成验证|请先完成安全验证|访问异常|您的环境存在异常/.test(doc.body.textContent)) {
        return { error: 'BOSS 补充信息页提示验证或访问环境异常，已暂停读取，请查看 BOSS 页面提示。' };
      }
      if (!doc.querySelector('h1')) throw new Error('detail page unavailable');
      // BOSS puts campus requirements outside postDescription. Scope to this
      // job's metadata, not recommendation cards or unrelated page dates.
      const school = doc.querySelector('.job-detail-section .school-job-sec');
      if (school) {
        // BOSS can insert its source watermark inside metadata labels.
        // Remove that fixed platform text before recognizing the field names.
        const schoolText = school.textContent.replace(/来自\s*BOSS\s*直聘/gi, '').replace(/[\u200b-\u200d\u2060\ufeff]/g, '');
        const graduation = schoolText.match(/毕业(?:时间|年份|年度|届数)\s*[：:]\s*[^\n\r]+?(?:年|届)/)?.[0];
        if (needsGraduation && graduation) result.graduateYear = graduation;
        if (needsDeadline) result.applicationDeadline = schoolText.match(/(?:招聘|报名|投递)?截止(?:日期|时间)\s*[：:]\s*(20\d{2}\s*[-./年]\s*\d{1,2}\s*[-./月]\s*\d{1,2}(?:日)?|长期有效|长期招聘|招满即止|招满为止|额满即止)/)?.[1] || result.applicationDeadline || '';
      }
      for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
        let parsed;
        try { parsed = JSON.parse(script.textContent); } catch { continue; }
        const nodes = (Array.isArray(parsed) ? parsed : [parsed]).flatMap(item => item?.['@graph'] || [item]);
        for (const node of nodes) {
          const identity = node?.url || node?.['@id'];
          try { if (new URL(identity).origin !== location.origin || new URL(identity).pathname !== path) continue; }
          catch { continue; }
          if (node['@type'] === 'JobPosting') {
            if (needsDeadline && typeof node.validThrough === 'string') result.applicationDeadline ||= node.validThrough;
            if (typeof node.datePosted === 'string') result.publishTime ||= node.datePosted;
            if (typeof node.dateModified === 'string') result.updateTime ||= node.dateModified;
          }
        }
      }
    } catch { result.detailWarning = '岗位正文已读取，届数与截止时间所在的详情页未能读取。'; }
    return result;
  } catch { return { error: '岗位详情读取超时或连接中断，请稍后重试。' }; }
}
