// Executed in one assistant-owned background detail tab. Reads only this job.
export function readRenderedMetadata({ jobId, allowMissingMetadata = false }) {
  const path = `/job_detail/${jobId}.html`;
  if (location.origin !== 'https://www.zhipin.com' || location.pathname !== path) {
    return { error: 'BOSS 详情转入其他页面，已暂停读取。请查看 BOSS 是否要求登录或验证。' };
  }
  const section = document.querySelector('.job-detail-section');
  if (!document.querySelector('h1') || !section) {
    if (/请完成验证|请先完成安全验证|您的环境存在异常/.test(document.body?.innerText || '')) {
      return { error: 'BOSS 详情需要验证或提示环境异常，已暂停读取。' };
    }
    return { pending: true };
  }
  const school = section.querySelector('.school-job-sec');
  const text = (school?.innerText || '').replace(/来自\s*BOSS\s*直聘/gi, '').replace(/[\u200b-\u200d\u2060\ufeff]/g, '');
  // The job body can render before the separate campus metadata node.
  // Give that node the bounded DOM polling window before accepting its absence.
  if (!text.trim() && !allowMissingMetadata) return { pending: true };
  return {
    graduateYear: text.match(/毕业(?:时间|年份|年度|届数)\s*[：:]\s*[^\n\r]+?(?:年|届)/)?.[0] || '',
    applicationDeadline: text.match(/(?:招聘|报名|投递)?截止(?:日期|时间)\s*[：:]\s*(20\d{2}\s*[-./年]\s*\d{1,2}\s*[-./月]\s*\d{1,2}(?:日)?|长期有效|长期招聘|招满即止|招满为止|额满即止)/)?.[1] || '',
    postDescription: (section.querySelector('.job-sec-text') || section).innerText,
  };
}
