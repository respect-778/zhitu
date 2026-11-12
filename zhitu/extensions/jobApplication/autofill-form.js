// This function is serialized by chrome.scripting. Keep every dependency inside it.
export async function fillOfficialApplication(input) {
  const active = globalThis.__knowviaAutofillRun;
  if (active) return active.taskId === input.taskId ? active.promise : { state: 'waiting_form', fields: [] };
  const slot = { taskId: input.taskId, promise: null };
  globalThis.__knowviaAutofillRun = slot;
  slot.promise = Promise.resolve().then(perform).finally(() => {
    if (globalThis.__knowviaAutofillRun === slot) delete globalThis.__knowviaAutofillRun;
  });
  return slot.promise;

  async function perform() {
    const pageDocument = document;
    const pageRoot = document.documentElement;
    const { taskId, target, profile } = input;
    const system = target.system || 'moka';
    const fields = [];
    const checks = [];
    const observed = new Set();
    const handled = new Set();
    const norm = value => String(value ?? '').trim();
    const pause = () => new Promise(resolve => setTimeout(resolve, 120));
    function add(field, status, message) {
      const result = { field, status, message };
      fields.push(result);
      return result;
    }
    const visible = node => Boolean(node?.isConnected && node.getClientRects().length && !node.closest('[hidden],[inert]')
      && getComputedStyle(node).visibility !== 'hidden' && getComputedStyle(node).display !== 'none');
    const unavailable = found => found.control.disabled || found.control.getAttribute('aria-disabled') === 'true'
      || found.wrapper?.getAttribute('aria-disabled') === 'true';
    const invalid = found => unavailable(found)
      || found.control.getAttribute('aria-invalid') === 'true' || found.control.validity?.valid === false
      || found.wrapper?.matches('.ud-formily-item-error,.form-item__error')
      || Boolean(found.wrapper && [...found.wrapper.querySelectorAll('[aria-invalid="true"],.ud-formily-item-error,.form-item__error')].some(visible))
      || found.wrapper?.getAttribute('aria-invalid') === 'true' || (found.control.tagName === 'SELECT'
        && [...found.control.selectedOptions].some(option => option.disabled || option.closest('optgroup')?.disabled));
    const loginBlocked = () => [...document.querySelectorAll('[role="dialog"],[class*="login-"],[class*="Login-"]')].filter(visible)
      .some(node => /登录|登入|sign.?in|log.?in/i.test(node.textContent) && node.querySelector('input'));
    function routeMatches(url) {
      if (url.origin !== target.origin || url.username || url.password
        || url.pathname.replace(/\/$/, '') !== target.pathname.replace(/\/$/, '')) return false;
      if (system === 'moka') return target.origin === 'https://app.mokahr.com'
        && /^\/(campus_apply|apply)\/[\w-]+(?:\/\d+)?\/?$/.test(url.pathname)
        && /^[a-f\d-]{36}$/i.test(target.jobId)
        && [...url.searchParams].every(([key, value]) => key === 'pure' && value === '1')
        && new RegExp(`^#/job/${target.jobId}/apply(?:\\?[^#]*)?$`, 'i').test(url.hash);
      if (system === 'feishu') return /^https:\/\/[a-z0-9-]+\.jobs\.feishu\.cn$/.test(target.origin)
        && /^[\w-]+$/.test(target.site) && /^\d+$/.test(target.jobId)
        && url.pathname.replace(/\/$/, '') === `/${target.site}/resume/${target.jobId}/apply` && !url.search && !url.hash;
      if (system === 'beisen') return /^https:\/\/[a-z0-9-]+\.zhiye\.com$/.test(target.origin)
        && url.pathname.replace(/\/$/, '') === '/form' && /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(target.jobId)
        && [...url.searchParams].length === 2 && url.searchParams.getAll('fromPage').length === 1
        && url.searchParams.get('fromPage') === 'job' && url.searchParams.getAll('jobAdId').length === 1
        && url.searchParams.get('jobAdId')?.toLowerCase() === target.jobId && !url.hash;
      return false;
    }
    function guard() {
      if (globalThis.__knowviaAutofillCancelled === taskId || (Number.isFinite(input.expiresAt) && Date.now() >= input.expiresAt)) throw new Error('cancelled');
      if (document !== pageDocument || document.documentElement !== pageRoot || !routeMatches(new URL(location.href))) throw new Error('page');
      if (loginBlocked()) throw new Error('login');
    }
    const titles = {
      name: ['姓名'], phone: ['手机号码', '手机号', '联系电话', '手机'], email: ['邮箱', '电子邮箱', '电子邮件'],
      age: ['年龄'], birthDate: ['出生日期(年龄)', '出生日期（年龄）', '出生日期', '出生年月', '生日'],
      school: ['学校名称', '学校', '毕业院校'], major: ['专业名称', '专业'], degree: ['学历'],
      startDate: ['入学时间', '入学日期', '开始时间'], endDate: ['毕业时间', '毕业日期', '结束时间'], range: ['就读时间', '起止时间'],
    };
    const wrapperSelector = { moka: '[class*="apply-field-"], label[data-field]',
      feishu: '.ud-formily-item[data-form-field-name]', beisen: '.fields-col .form-item' }[system];
    const wrappers = root => root ? [...root.querySelectorAll(wrapperSelector)].filter(visible) : [];
    const title = wrapper => norm(wrapper.querySelector({ moka: '[class^="title-"], [data-field-title]',
      feishu: '.ud-formily-item-label-content label', beisen: '.form-item__title label' }[system])?.textContent).replace(/\s+|[＊*：:]/g, '');
    const required = wrapper => Boolean(wrapper?.querySelector({ moka: '[class*="required-asterisk-"]',
      feishu: '.ud-formily-item-asterisk', beisen: '.form-item__required' }[system]));
    const feishuKeys = { name: 'name', phone: 'mobile', email: 'email', age: 'age', birthDate: 'birthday',
      school: 'school', major: 'field_of_study', degree: 'degree', range: 'start_end_time' };
    function customContainer(control) {
      return control?.closest('[class*="sd-Select-container-"],.ud__select__selector,.phoenix-select');
    }
    function locate(root, key) {
      const matches = wrappers(root).filter(wrapper => system === 'feishu'
        ? wrapper.dataset.formFieldName === feishuKeys[key] : titles[key].includes(title(wrapper)));
      if (matches.length !== 1) return { status: matches.length ? 'ambiguous' : 'missing' };
      const wrapper = matches[0];
      let controls = [...wrapper.querySelectorAll('input,select,textarea')].filter(visible)
        .filter(node => !/^(hidden|password|checkbox|radio|file|submit|button)$/i.test(node.type)
          && !/密码|验证码|校验码|password|captcha|otp/i.test(`${node.name} ${node.placeholder} ${node.autocomplete}`));
      if (key === 'phone') {
        const exact = controls.filter(node => /^(请输入)?(手机号|手机号码|11位手机号)$/.test(node.placeholder));
        if (exact.length) controls = exact;
      }
      const custom = wrapper.querySelector('.ud__select__selector,.phoenix-select');
      if (!controls.length && custom && visible(custom)) controls = [custom];
      if (controls.length !== 1) return { status: controls.length ? 'ambiguous' : 'unsupported', wrapper };
      return { wrapper, control: controls[0] };
    }
    function valueOf(control) {
      if (control.tagName === 'SELECT') return control.value ? control.selectedOptions[0]?.textContent.trim() || '' : '';
      const container = customContainer(control);
      const selector = system === 'feishu' ? '.ud__select__selector__selectItem'
        : system === 'beisen' ? '.phoenix-select__tagItem' : '[class*="sd-Input-display-value-"]';
      const displays = container ? [...container.querySelectorAll(selector)].filter(visible) : [];
      if (displays.length > 1) throw new Error('structure');
      return container ? norm(displays[0]?.textContent) : norm(control.value);
    }
    function sections(kind) {
      if (system === 'moka') return [...document.querySelectorAll(`[data-nav-id="block-${kind === 'basic' ? 'basicInfo' : 'educationInfo'}"]`)].filter(visible);
      if (system === 'feishu') return [...document.querySelectorAll('.resumeEditForm-wrapper .applyFormModuleWrapper-text')]
        .filter(node => visible(node) && norm(node.textContent) === (kind === 'basic' ? '基本信息' : '教育经历'))
        .map(node => node.closest('[class*="applyFormModuleWrapper__"]')).filter(Boolean);
      return [...document.querySelectorAll('.ux-standard-form > div.form[name]')].filter(visible).filter(form => {
        const labels = wrappers(form).map(title);
        return (kind === 'basic' ? ['姓名', '邮箱', '手机号码'] : ['学校名称', '专业名称', '开始时间', '结束时间']).every(label => labels.includes(label));
      });
    }
    function section(kind) {
      const matches = sections(kind);
      if (matches.length > 1) throw new Error('structure');
      return matches[0];
    }
    function blocks() {
      if (system === 'beisen') return sections('education');
      const root = section('education');
      const selector = system === 'feishu' ? '[class^="apply-form-array-card__"]' : ':scope > [class*="apply-fields-"]';
      return root ? [...root.querySelectorAll(selector)].filter(visible) : [];
    }
    function dispatch(resolve, types) {
      for (const type of types) {
        guard();
        const found = resolve();
        const current = found.control;
        if (!current || !visible(current) || unavailable(found)) throw new Error('structure');
        current.dispatchEvent(type === 'focusout' ? new FocusEvent(type, { bubbles: true }) : new Event(type, { bubbles: true }));
      }
    }
    function setNative(control, value, resolve, search = false) {
      guard();
      const prototype = control.tagName === 'SELECT' ? HTMLSelectElement.prototype
        : control.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, 'value').set.call(control, value);
      dispatch(resolve, search ? ['input', 'change'] : ['input', 'change', 'blur', 'focusout']);
    }
    function dateValue(value) {
      if (!/^\d{4}年(?:\d{1,2}月(?:\d{1,2}日)?)?$/.test(value.trim())
        && !/^\d{4}(?:([./-])\d{1,2}(?:\1\d{1,2})?)?$/.test(value.trim())) return null;
      const source = value.trim().replace(/年|月|[./]/g, '-').replace(/日$/, '').replace(/-$/, '');
      const match = /^(\d{4})(?:-(\d{1,2})(?:-(\d{1,2}))?)?$/.exec(source);
      if (!match || Number(match[1]) < 1900 || Number(match[1]) > 2200) return null;
      const [, year, rawMonth, rawDay] = match;
      const month = rawMonth?.padStart(2, '0');
      const day = rawDay?.padStart(2, '0');
      if (month && (+month < 1 || +month > 12)) return null;
      if (day && (+day < 1 || +day > new Date(+year, +month, 0).getDate())) return null;
      return { year, month, day, value: [year, month, day].filter(Boolean).join('-') };
    }
    function dateBounds(parsed) {
      const lastMonth = +(parsed.month || 12);
      return { start: Date.UTC(+parsed.year, +(parsed.month || 1) - 1, +(parsed.day || 1)),
        end: Date.UTC(+parsed.year, lastMonth - 1, +(parsed.day || new Date(+parsed.year, lastMonth, 0).getDate())) };
    }
    async function selectCustom(resolve, wanted, kind, field, stopForExisting) {
      const monthDate = system === 'beisen' && /Date$/.test(kind);
      const parsed = monthDate ? dateValue(wanted) : null;
      if (kind !== 'degree' && !monthDate) { add(field, 'unsupported', '此自定义控件的交互尚未验证。'); return false; }
      if (monthDate && (!parsed?.month || parsed.day)) { add(field, 'unsupported', '日期控件无法保留简历日期精度。'); return false; }
      const menuSelector = system === 'feishu' ? '.ud__select__dropdown'
        : '.common-unmodeled-layer__layerContent .phoenix-selectList,.common-unmodeled-layer .phoenix-date-picker';
      const menus = () => [...document.querySelectorAll(menuSelector)].filter(visible);
      const before = new Set(menus());
      let found = resolve();
      const container = customContainer(found.control);
      const trigger = system === 'beisen' ? container?.querySelector('.phoenix-select__switchArrow') : container;
      if (!trigger || before.size) { add(field, 'ambiguous', '下拉菜单归属无法确认。'); return false; }
      guard(); trigger.click(); await pause(); guard();
      found = resolve();
      if (!found.control || !visible(found.control) || unavailable(found)) { add(field, 'invalid', '交互后字段发生变化。'); return false; }
      if (stopForExisting(found)) return false;
      const current = customContainer(found.control);
      const opened = menus().filter(menu => !before.has(menu));
      let owned = opened.length === 1 && current?.contains(opened[0]);
      if (opened.length === 1 && !owned) {
        const ids = `${current?.getAttribute('aria-controls') || ''} ${current?.getAttribute('aria-owns') || ''} ${found.control.getAttribute('aria-controls') || ''}`.split(/\s+/).filter(Boolean);
        owned = Boolean(opened[0].id && ids.includes(opened[0].id));
      }
      if (system === 'beisen' && opened.length === 1) {
        const active = [...document.querySelectorAll('.phoenix-select__placeHolder--active')].filter(visible);
        owned = active.length === 1 && current?.contains(active[0]);
      }
      if (!owned || opened.length !== 1) { add(field, 'ambiguous', '下拉菜单归属无法确认。'); return false; }
      if (monthDate) return selectBeisenMonth(resolve, opened[0], parsed, field, stopForExisting);
      const expected = system === 'beisen' ? ({ 硕士: '硕士研究生', 博士: '博士研究生' }[wanted] || wanted) : wanted;
      const optionSelector = system === 'feishu' ? '.ud__select__list__item' : '.phoenix-selectList__listItem';
      const labelSelector = system === 'feishu' ? '.ud__select__list__item__content' : '.phoenix-selectList__singleLabel';
      const options = [...opened[0].querySelectorAll(optionSelector)].filter(visible)
        .filter(node => !node.hasAttribute('disabled') && node.getAttribute('aria-disabled') !== 'true'
          && !/disabled/i.test(node.className))
        .filter(node => norm(node.querySelector(labelSelector)?.textContent ?? node.textContent) === expected);
      if (options.length !== 1) { add(field, options.length ? 'ambiguous' : 'unsupported', '下拉选项无法唯一精确匹配。'); return false; }
      guard();
      if (stopForExisting(resolve())) return false;
      options[0].click(); await pause(); guard();
      dispatch(resolve, ['blur', 'focusout']);
      return true;
    }
    async function selectBeisenMonth(resolve, menu, parsed, field, stopForExisting) {
      if (!menu.matches('.phoenix-date-picker') || !menu.querySelector('.phoenix-calendar-month-calendar')) {
        add(field, 'unsupported', '自定义日期结构尚未验证。'); return false;
      }
      function ready() {
        guard();
        const found = resolve();
        const active = [...document.querySelectorAll('.phoenix-select__placeHolder--active')].filter(visible);
        if (!visible(menu) || !found.control || !visible(found.control) || unavailable(found)
          || active.length !== 1 || !customContainer(found.control)?.contains(active[0])) throw new Error('structure');
        return !stopForExisting(found);
      }
      async function clickUnique(selector, text) {
        if (!ready()) return false;
        const nodes = [...menu.querySelectorAll(selector)].filter(visible)
          .filter(node => !node.hasAttribute('disabled') && node.getAttribute('aria-disabled') !== 'true'
            && !/disabled/i.test(node.className) && !/disabled/i.test(node.parentElement?.className || '') && (text === undefined || norm(node.textContent) === text));
        if (nodes.length !== 1) { add(field, nodes.length ? 'ambiguous' : 'unsupported', '日期选项无法唯一精确匹配。'); return false; }
        guard(); nodes[0].click(); await pause(); guard();
        return true;
      }
      const yearSelector = '.phoenix-calendar-month-panel-year-select';
      const year = () => {
        const nodes = [...menu.querySelectorAll(yearSelector)].filter(visible);
        const value = nodes.length === 1 ? norm(nodes[0].textContent).replace(/[^0-9]/g, '') : '';
        return /^\d{4}$/.test(value) ? value : null;
      };
      if (!year()) { add(field, 'unsupported', '日期面板年份无法确认。'); return false; }
      if (year() !== parsed.year) {
        if (!await clickUnique(yearSelector)) return false;
        for (let attempts = 0; attempts < 32; attempts++) {
          if (!ready()) return false;
          const years = [...menu.querySelectorAll('.phoenix-calendar-year-panel-year')].filter(visible)
            .filter(node => norm(node.textContent) === parsed.year);
          if (years.length) {
            if (!await clickUnique('.phoenix-calendar-year-panel-year', parsed.year)) return false;
            break;
          }
          const ranges = [...menu.querySelectorAll('.phoenix-calendar-year-panel-decade-select-content')].filter(visible);
          const range = ranges.length === 1 ? /^(\d{4})-(\d{4})$/.exec(norm(ranges[0].textContent)) : null;
          if (!range || +range[2] - +range[1] !== 9) { add(field, 'unsupported', '年份菜单范围无法确认。'); return false; }
          const direction = +parsed.year < +range[1] ? 'prev' : 'next';
          if (+parsed.year >= +range[1] && +parsed.year <= +range[2]) { add(field, 'unsupported', '日期选项无法唯一精确匹配。'); return false; }
          if (!await clickUnique(`.phoenix-calendar-year-panel-${direction}-decade-btn`)) return false;
        }
      }
      if (year() !== parsed.year) { add(field, 'invalid', '日期面板年份未保留。'); return false; }
      if (!await clickUnique('.phoenix-calendar-month-panel-cell a.phoenix-calendar-month-panel-month', `${+parsed.month}月`)) return false;
      dispatch(resolve, ['blur', 'focusout']);
      return true;
    }
    async function writeFeishuRange(resolveBlock, row, prefix) {
      const components = () => {
        const wrapper = locate(resolveBlock(), 'range').wrapper;
        const inputs = wrapper ? [...wrapper.querySelectorAll('.throne-biz-date-range-picker-input input')].filter(visible) : [];
        if (inputs.length !== 2) throw new Error('structure');
        return { wrapper, inputs };
      };
      let range;
      try { range = components(); } catch { add(`${prefix}.dates`, 'unsupported', '自定义日期结构尚未验证。'); return; }
      handled.add(range.wrapper);
      for (const [index, key] of ['startDate', 'endDate'].entries()) {
        const resolver = () => { const current = components(); return { wrapper: current.wrapper, control: current.inputs[index] }; };
        await write(resolver, row[key], `${prefix}.${key}`, key);
      }
    }
    async function write(resolve, wanted, field, kind) {
      guard();
      let found = resolve();
      if (found.status) { add(field, found.status, '无法唯一定位可填写字段。'); return; }
      const { control, wrapper } = found;
      observed.add(control);
      handled.add(wrapper);
      const mandatory = control.required || control.getAttribute('aria-required') === 'true' || required(wrapper);
      if (!wanted) { if (mandatory && !valueOf(control)) add(field, 'missing', '简历缺少此必填信息。'); return; }
      if (unavailable(found)) { add(field, 'unsupported', '字段当前不可编辑。'); return; }
      const allowedTypes = { name: ['text'], phone: ['text', 'tel'], email: ['text', 'email'], age: ['text', 'number'],
        birthDate: ['text', 'date', 'month'], school: ['text', 'search'], major: ['text', 'search'], degree: ['text'],
        startDate: ['text', 'date', 'month', 'number'], endDate: ['text', 'date', 'month', 'number'], yearPart: ['text', 'search'], monthPart: ['text', 'search'] };
      const custom = customContainer(control);
      if (!custom && control.tagName !== 'SELECT' && !allowedTypes[kind]?.includes(control.type)) { add(field, 'unsupported', '字段类型与简历信息不一致。'); return; }
      if (/Date$/.test(kind)) {
        const parsed = dateValue(wanted);
        if (!parsed) { add(field, 'invalid', '简历日期格式无效。'); return; }
        if (system === 'feishu' && (!parsed.month || parsed.day)) { add(field, 'unsupported', '日期控件无法保留简历日期精度。'); return; }
        wanted = parsed.value;
      }
      const compare = value => system === 'beisen' && kind === 'degree' ? ({ 硕士研究生: '硕士', 博士研究生: '博士' }[norm(value)] || norm(value)) : kind === 'yearPart' ? String(value).replace(/年$/, '')
        : kind === 'monthPart' && /^(0?[1-9]|1[0-2])月?$/.test(value) ? String(parseInt(value, 10)).padStart(2, '0') : norm(value);
      const comparable = value => compare(/Date$/.test(kind) ? dateValue(value)?.value || value : value);
      const remember = result => {
        if (!['filled', 'existing'].includes(result.status)) return;
        checks.push({ result, verify: () => {
          const latest = resolve();
          if (latest.control) { observed.add(latest.control); handled.add(latest.wrapper); }
          return latest.control && visible(latest.control) && !invalid(latest)
            && (customContainer(latest.control) || latest.control.tagName === 'SELECT' || allowedTypes[kind].includes(latest.control.type))
            && comparable(valueOf(latest.control)) === comparable(wanted);
        } });
      };
      function stopForExisting(current) {
        const existing = valueOf(current.control);
        if (!existing) return false;
        observed.add(current.control); handled.add(current.wrapper);
        const status = invalid(current) ? 'invalid' : comparable(existing) === comparable(wanted) ? 'existing' : 'conflict';
        remember(add(field, status, status === 'invalid' ? '页面校验未通过。' : '已检查字段原有内容。'));
        return true;
      }
      // Feishu dates can display an uncommitted value. Reuse the normal commit and readback path for an exact match.
      const needsDateCommit = system === 'feishu' && /Date$/.test(kind)
        && comparable(valueOf(control)) === comparable(wanted) && !invalid(found);
      if (!needsDateCommit && stopForExisting(found)) return;
      if (!custom && (control.readOnly || control.tagName === 'TEXTAREA')) { add(field, 'unsupported', '控件需要尚未验证的交互。'); return; }
      if (/Date$/.test(kind)) {
        const parsed = dateValue(wanted);
        if ((control.type === 'date' && !parsed.day) || (control.type === 'month' && (!parsed.month || parsed.day))
          || (control.type === 'number' && parsed.month)) { add(field, 'unsupported', '日期控件无法保留简历日期精度。'); return; }
      }
      let expected = wanted;
      if (custom && system !== 'moka') {
        if (!await selectCustom(resolve, wanted, kind, field, stopForExisting)) return;
      } else if (custom) {
        const ready = current => current.control && visible(current.control) && !current.control.disabled
          && current.control.getAttribute('aria-disabled') !== 'true' && current.control.tagName === 'INPUT'
          && allowedTypes[kind].includes(current.control.type) && current.control.closest('[class*="sd-Select-container-"]');
        guard(); control.click(); await pause(); guard();
        found = resolve();
        if (!ready(found)) { add(field, 'invalid', '交互后字段发生变化。'); return; }
        if (stopForExisting(found)) return;
        if (!found.control.readOnly) { setNative(found.control, wanted, resolve, true); await pause(); guard(); }
        found = resolve();
        if (!ready(found)) { add(field, 'invalid', '交互后字段发生变化。'); return; }
        if (stopForExisting(found)) return;
        const dropdown = found.control?.closest('[class*="sd-Dropdown-container-"]') || found.wrapper;
        const options = [...dropdown.querySelectorAll('[class*="sd-Select-common-item-"]')].filter(visible)
          .filter(node => !node.hasAttribute('disabled') && node.getAttribute('aria-disabled') !== 'true')
          .filter(node => compare((node.querySelector('[class*="option-label-"]')?.textContent ?? node.textContent).trim()) === compare(wanted));
        if (options.length !== 1) { add(field, options.length ? 'ambiguous' : 'unsupported', '下拉选项无法唯一精确匹配。'); return; }
        guard(); options[0].click();
        await pause(); guard();
        dispatch(resolve, ['blur', 'focusout']);
      } else if (control.tagName === 'SELECT') {
        const options = [...control.options].filter(option => !option.disabled && !option.closest('optgroup')?.disabled && norm(option.textContent) === norm(wanted));
        if (options.length !== 1) { add(field, options.length ? 'ambiguous' : 'unsupported', '下拉选项无法唯一精确匹配。'); return; }
        expected = options[0].value; setNative(control, expected, resolve);
      } else {
        setNative(control, wanted, resolve, system === 'feishu' && /Date$/.test(kind));
        if (system === 'feishu' && /Date$/.test(kind)) {
          guard();
          const current = resolve().control;
          current.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
          dispatch(resolve, ['blur', 'focusout']);
        }
      }
      await pause(); guard();
      found = resolve();
      if (!found.control || !visible(found.control)) { add(field, 'invalid', '填写后字段已变化，无法回读。'); return; }
      observed.add(found.control);
      handled.add(found.wrapper);
      const actual = custom ? valueOf(found.control) : found.control.value;
      const failed = invalid(found);
      remember(add(field, comparable(actual) === comparable(custom ? wanted : expected) && !failed ? 'filled' : 'invalid',
        failed ? '页面校验未通过。' : comparable(actual) === comparable(custom ? wanted : expected) ? '已填写并回读确认。' : '页面未保留填写结果。'));
    }
    try {
      guard();
      const basicSections = sections('basic');
      const educationSections = sections('education');
      if (!basicSections.length) return { state: document.querySelector('input[type="password"]') ? 'waiting_login' : 'waiting_form', fields };
      if (basicSections.length !== 1 || (system !== 'beisen' && educationSections.length > 1)) return { state: 'needs_attention', fields: [{ field: 'form', status: 'ambiguous', message: '申请表区域不唯一。' }] };
      const basic = () => section('basic');
      let ageConflict = false;
      if (profile.age && (!/^\d{1,3}$/.test(profile.age) || +profile.age > 120)) { add('age', 'invalid', '简历年龄格式无效。'); ageConflict = true; }
      if (profile.birthDate) {
        const birth = dateValue(profile.birthDate);
        const today = new Date();
        if (!birth || dateBounds(birth).start > Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())) {
          add('birthDate', 'invalid', '简历出生日期无效。'); ageConflict = true;
        }
        else if (profile.age && !ageConflict) {
          const now = new Date();
          const ageAt = (month, day) => now.getFullYear() - +birth.year
            - Number(now.getMonth() + 1 < month || (now.getMonth() + 1 === month && now.getDate() < day));
          const maxAge = ageAt(+(birth.month || 1), +(birth.day || 1));
          const lastMonth = +(birth.month || 12);
          const minAge = ageAt(lastMonth, +(birth.day || new Date(+birth.year, lastMonth, 0).getDate()));
          if (+profile.age < minAge || +profile.age > maxAge) {
            add('age', 'conflict', '简历年龄与出生日期不一致。'); add('birthDate', 'conflict', '简历年龄与出生日期不一致。'); ageConflict = true;
          }
        }
      }
      for (const key of ['name', 'phone', 'email', 'age', 'birthDate']) {
        if ((key === 'age' || key === 'birthDate') && ageConflict) continue;
        if (profile[key] || !locate(basic(), key).status) await write(() => locate(basic(), key), profile[key], key, key);
      }
      const degreeValue = value => system === 'beisen' ? ({ 硕士研究生: '硕士', 博士研究生: '博士' }[value] || value) : value;
      const signature = block => Object.fromEntries(['school', 'major', 'degree'].map(key => [key, locate(block, key).control ? degreeValue(norm(valueOf(locate(block, key).control))) : '']));
      const initial = blocks().map((block, index) => ({ index, values: signature(block) }));
      function score(row, values) {
        if (values.school) return norm(row.school) === values.school ? 8 + Number(Boolean(values.major) && norm(row.major) === values.major) * 2 + Number(Boolean(values.degree) && degreeValue(norm(row.degree)) === values.degree) : 0;
        if (values.major) return norm(row.major) === values.major ? 4 + Number(Boolean(values.degree) && degreeValue(norm(row.degree)) === values.degree) : 0;
        return values.degree && degreeValue(norm(row.degree)) === values.degree ? 1 : 0;
      }
      const bindings = new Map();
      const used = new Set();
      for (const [index, row] of profile.education.entries()) {
        const candidates = initial.map(block => ({ ...block, score: score(row, block.values) })).filter(block => block.score);
        const best = Math.max(0, ...candidates.map(block => block.score));
        const matches = candidates.filter(block => block.score === best);
        const peerBest = matches.length === 1 ? Math.max(...profile.education.map(other => score(other, matches[0].values))) : 0;
        if (matches.length === 1 && best === peerBest && profile.education.filter(other => score(other, matches[0].values) === best).length === 1 && !used.has(matches[0].index)) {
          bindings.set(index, matches[0].index); used.add(matches[0].index);
        }
      }
      const remaining = profile.education.map((_, index) => index).filter(index => !bindings.has(index));
      const empty = initial.filter(block => !used.has(block.index) && Object.values(block.values).every(value => !value));
      if (remaining.length === 1 && empty.length === 1) bindings.set(remaining[0], empty[0].index);
      for (const [index, row] of profile.education.entries()) {
        const prefix = `education.${index}`;
        if (!bindings.has(index)) { add(prefix, initial.length ? 'ambiguous' : 'missing', '教育经历无法唯一关联，需要人工确认。'); continue; }
        const blockIndex = bindings.get(index);
        let anchor = initial[blockIndex].values;
        let boundElement = blocks()[blockIndex];
        const resolveBlock = () => {
          const current = blocks();
          if (current.length !== initial.length) throw new Error('structure');
          const anchors = Object.entries(anchor).filter(([, value]) => value);
          const candidates = anchors.length ? current.filter(block => anchors.every(([key, value]) => signature(block)[key] === value)) : [];
          if (candidates.length === 1) return candidates[0];
          if (!anchors.length && current.includes(boundElement)) return boundElement;
          if (!anchors.length && current.length === 1) return current[0];
          throw new Error('structure');
        };
        const range = locate(resolveBlock(), 'range');
        const start = dateValue(row.startDate);
        const end = dateValue(row.endDate);
        const reversed = start && end && dateBounds(start).start > dateBounds(end).end;
        if (reversed) {
          add(`${prefix}.startDate`, 'conflict', '入学日期与毕业日期顺序不一致。');
          add(`${prefix}.endDate`, 'conflict', '入学日期与毕业日期顺序不一致。');
        }
        const keys = range.wrapper || reversed ? ['school', 'major', 'degree'] : ['school', 'major', 'degree', 'startDate', 'endDate'];
        for (const key of keys) {
          const resolver = () => locate(resolveBlock(), key);
          if (row[key] || !resolver().status) await write(resolver, row[key], `${prefix}.${key}`, key);
          boundElement = resolveBlock(); anchor = signature(boundElement);
        }
        if (range.wrapper && !reversed) {
          handled.add(range.wrapper);
          if (system === 'feishu') {
            await writeFeishuRange(resolveBlock, row, prefix);
            continue;
          }
          const readComponents = () => [...locate(resolveBlock(), 'range').wrapper.querySelectorAll('.month-range-select input')].filter(visible);
          const validComponents = controls => controls.length === 4 && controls.every((control, position) => control.placeholder === (position % 2 ? '月' : '年'));
          if (!validComponents(readComponents())) {
            add(`${prefix}.dates`, 'unsupported', '自定义日期结构尚未验证。'); continue;
          }
          const components = () => {
            const controls = readComponents();
            if (!validComponents(controls)) throw new Error('structure');
            return controls;
          };
          for (const [offset, key] of ['startDate', 'endDate'].entries()) {
            if (!row[key]) { if (required(range.wrapper)) add(`${prefix}.${key}`, 'missing', '简历缺少此必填日期。'); continue; }
            const parsed = dateValue(row[key]);
            if (!parsed || parsed.day) { add(`${prefix}.${key}`, parsed ? 'unsupported' : 'invalid', '日期控件无法保留简历日期精度。'); continue; }
            if (!parsed.month && required(range.wrapper)) add(`${prefix}.${key}`, 'unsupported', '必填年月无法从仅年份信息补全。');
            const results = fields.length;
            for (const [part, wanted] of [parsed.year, parsed.month].entries()) {
              const resolver = () => ({ control: components()[offset * 2 + part], wrapper: locate(resolveBlock(), 'range').wrapper });
              if (wanted) await write(resolver, wanted, `${prefix}.${key}.${part ? 'month' : 'year'}`, part ? 'monthPart' : 'yearPart');
              else if (valueOf(resolver().control)) add(`${prefix}.${key}.month`, 'conflict', '页面月份超出简历日期精度。');
            }
            if (fields.length === results) add(`${prefix}.${key}`, 'missing', '简历缺少日期信息。');
          }
        }
      }
      await pause(); guard();
      for (const check of checks) {
        let valid = false;
        try { valid = check.verify(); } catch { /* A changed field cannot be verified. */ }
        if (!valid) { check.result.status = 'invalid'; check.result.message = '最终回读发现字段已变化或校验未通过。'; }
      }
      let requiredIndex = 0;
      const formRoot = document.body;
      for (const wrapper of wrappers(formRoot).filter(required)) {
        if (handled.has(wrapper)) continue;
        add(`required.${requiredIndex++}`, 'missing', '页面还有未处理的必填项目。');
        wrapper.querySelectorAll('input,select,textarea,[aria-required="true"]').forEach(control => observed.add(control));
      }
      for (const control of formRoot.querySelectorAll('input[required],select[required],textarea[required],[aria-required="true"]')) {
        const unanswered = /^(checkbox|radio)$/.test(control.type) ? !control.checked
          : control.matches('input,select,textarea') ? !valueOf(control) : true;
        if (visible(control) && !control.disabled && !observed.has(control) && unanswered)
          add(`required.${requiredIndex++}`, 'missing', '页面还有未处理的必填项目。');
      }
      guard();
      return { state: fields.some(field => !['filled', 'existing'].includes(field.status)) ? 'needs_attention' : 'filled', fields };
    } catch (error) {
      if (error.message === 'cancelled') return { state: 'cancelled', fields };
      if (error.message === 'login') return { state: 'waiting_login', fields };
      add('form', 'invalid', '页面或表单结构发生变化，已停止填写。');
      return { state: 'needs_attention', fields };
    }
  }
}

// Keep the existing direct-call entry compatible with the shared serialized implementation.
export const fillMokaApplication = fillOfficialApplication;
