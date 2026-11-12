const UUID = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;
const ID = /^[\w-]{1,100}$/;
export const AUTOFILL_TTL = 20 * 60 * 1000;
const FEISHU_HOST = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.jobs\.feishu\.cn$/;
const BEISEN_HOST = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.zhiye\.com$/;
const unsupported = () => new Error('该官网暂未适配自动填写，当前支持 Moka、飞书招聘和北森的企业招聘页。');

function mokaDestination(url) {
  const path = url.pathname.match(/^\/(campus-recruitment|social-recruitment|campus_apply|apply)\/([\w-]+)(?:\/(\d+))?\/?$/);
  const job = url.hash.match(/^#\/job\/([a-f\d-]{36})(?:\/apply)?(?:\?[^#]*)?$/i);
  const locales = url.searchParams.getAll('locale');
  const languageQuery = [...url.searchParams.keys()].every(key => key === 'locale')
    && locales.length <= 1 && locales.every(locale => ['zh-CN', 'en-US'].includes(locale));
  if (!languageQuery || !path || !job || !UUID.test(job[1])) throw unsupported();
  const campus = ['campus-recruitment', 'campus_apply'].includes(path[1]);
  const pathname = `/${campus ? 'campus_apply' : 'apply'}/${path[2]}${path[3] ? '/' + path[3] : ''}`;
  return { system: 'moka', origin: url.origin, pathname, jobId: job[1].toLowerCase(),
    url: `${url.origin}${pathname}#/job/${job[1]}/apply?pure=1` };
}

function feishuDestination(url) {
  const desktop = url.pathname.match(/^\/([\w-]+)\/(?:position\/(\d{10,24})\/detail|resume\/(\d{10,24})\/apply)\/?$/);
  const mobile = url.pathname.match(/^\/([\w-]+)\/m\/position\/(?:detail\/)?(\d{10,24})(?:\/detail)?\/?$/);
  const path = desktop || mobile;
  if (!path || url.hash) throw unsupported();
  const jobId = path[2] || path[3];
  const pathname = `/${path[1]}/resume/${jobId}/apply`;
  return { system: 'feishu', origin: url.origin, pathname, jobId, site: path[1], url: `${url.origin}${pathname}` };
}

function beisenDestination(url) {
  const detail = /^\/(intern|campus|social)\/detail\/?$/.test(url.pathname);
  const form = url.pathname === '/form' && url.searchParams.get('fromPage') === 'job';
  const ids = url.searchParams.getAll('jobAdId');
  if ((!detail && !form) || url.hash || ids.length !== 1 || !UUID.test(ids[0])) throw unsupported();
  const jobId = ids[0].toLowerCase();
  return { system: 'beisen', origin: url.origin, pathname: '/form', jobId,
    url: `${url.origin}/form?fromPage=job&jobAdId=${jobId}` };
}

export function officialDestination(address) {
  let url;
  try { url = new URL(address); } catch { throw new Error('岗位地址无效。'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) throw unsupported();
  if (url.hostname === 'app.mokahr.com') return mokaDestination(url);
  if (FEISHU_HOST.test(url.hostname)) return feishuDestination(url);
  if (BEISEN_HOST.test(url.hostname)) return beisenDestination(url);
  throw unsupported();
}

export function matchesOfficialDestination(address, target) {
  try {
    // Null selects the receiving document when this function is serialized by chrome.scripting.
    const url = new URL(address === null ? globalThis.location.href : address);
    if (url.origin !== target.origin || url.pathname.replace(/\/$/, '') !== target.pathname
      || url.username || url.password) return false;
    if (!target.system || target.system === 'moka') return !url.search
      && new RegExp(`^#/job/${target.jobId}/apply(?:\\?[^#]*)?$`, 'i').test(url.hash);
    if (target.system === 'feishu') return !url.search && !url.hash;
    if (target.system === 'beisen') return !url.hash && url.searchParams.get('fromPage') === 'job'
      && url.searchParams.get('jobAdId')?.toLowerCase() === target.jobId
      && url.searchParams.getAll('fromPage').length === 1 && url.searchParams.getAll('jobAdId').length === 1
      && [...url.searchParams.keys()].every(key => ['fromPage', 'jobAdId'].includes(key));
    return false;
  } catch { return false; }
}

export function isOfficialLogin(address, target) {
  try {
    const url = new URL(address);
    if (url.origin !== target.origin || url.username || url.password) return false;
    if (!target.system || target.system === 'moka') return /login|sign[-_]?in|captcha|verify|passport/i.test(url.pathname + url.hash);
    if (target.system === 'feishu' && url.pathname === `/${target.site}/login`) {
      const redirect = url.searchParams.get('redirect_path');
      if (url.searchParams.getAll('redirect_path').length !== 1 || !redirect || !redirect.startsWith('/') || redirect.startsWith('//')) return false;
      const path = redirect.startsWith(`/${target.site}/`) ? redirect : `/${target.site}${redirect}`;
      return matchesOfficialDestination(`${target.origin}${path}`, target);
    }
    if (target.system === 'beisen' && url.pathname === '/login') {
      const goto = url.searchParams.get('goto');
      return Boolean(url.searchParams.getAll('goto').length === 1 && goto && matchesOfficialDestination(new URL(goto, `${target.origin}/`).href, target));
    }
    return false;
  } catch { return false; }
}

export function isOfficialJobEntry(address, target) {
  try {
    if (matchesOfficialDestination(address, target)) return false;
    const entry = officialDestination(address);
    return entry.origin === target.origin && entry.pathname === target.pathname && entry.jobId === target.jobId;
  } catch { return false; }
}

function text(value, max = 200) {
  if (typeof value !== 'string' || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value))
    throw new Error('简历字段格式无效，请返回简历编辑器检查。');
  return value.trim();
}
export function autofillRequest(input) {
  if (!input || !UUID.test(input.operationId) || !ID.test(input.ownerId) || !ID.test(input.resumeId)
    || typeof input.revision !== 'string' || !input.revision || input.revision.length > 200
    || !Array.isArray(input.jobs) || input.jobs.length < 1 || input.jobs.length > 50)
    throw new Error('填写任务参数无效，每批请选择 1–50 个岗位。');
  const profile = input.profile;
  if (!profile || !Array.isArray(profile.education) || profile.education.length > 20)
    throw new Error('简历教育经历格式无效。');
  const clean = Object.fromEntries(['name', 'phone', 'email', 'age', 'birthDate'].map(key => [key, text(profile[key])]));
  clean.education = profile.education.map(row => ({
    id: text(row.id), school: text(row.school), major: text(row.major), degree: text(row.degree),
    startDate: text(row.startDate), endDate: text(row.endDate),
  }));
  if (new Set(clean.education.map(row => row.id)).size !== clean.education.length || clean.education.some(row => !row.id))
    throw new Error('教育经历标识重复，请返回简历编辑器检查。');
  const jobs = input.jobs.map(job => ({ jobId: text(job.jobId), title: text(job.title), company: text(job.company), jobUrl: text(job.jobUrl, 6000) }));
  if (new Set(jobs.map(job => job.jobId)).size !== jobs.length) throw new Error('所选岗位重复。');
  return { operationId: input.operationId, ownerId: input.ownerId, resumeId: input.resumeId,
    revision: input.revision, profile: clean, jobs };
}
