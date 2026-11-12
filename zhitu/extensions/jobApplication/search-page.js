export function matchesSearchPage(address, params) {
  try {
    const url = new URL(address);
    if (url.origin !== 'https://www.zhipin.com' || !/^\/web\/geek\/jobs?\/?$/.test(url.pathname)) return false;
    return ['query', 'city', 'degree', 'jobType'].every(key => (url.searchParams.get(key) || '') === (params[key] || ''));
  } catch { return false; }
}

// Runs inside the selected search tab. Only a status is returned to the extension.
export function inspectSearchPage() {
  if (/\/security(?:\.html|\/|$)|captcha|verify/i.test(location.pathname)) return 'verification';
  if (/\/passport(?:\/|$)|\/login(?:[/.]|$)|^\/web\/user\/?$/.test(location.pathname)) return 'login';
  if (location.origin !== 'https://www.zhipin.com' || !/^\/web\/geek\/jobs?\/?$/.test(location.pathname)) return 'redirected';
  const text = (document.body?.innerText || '').trim();
  if (/请(?:先)?完成(?:安全)?验证|访问异常|账号异常|您的环境存在异常|访问环境异常/.test(text)) return 'verification';
  if (!text) return 'blank';
  if (/^(?:正在加载|加载中|loading)[\s.…。!]*$/i.test(text)) return 'loading';
  return 'ready';
}
