import { addDays, beijingToday, coverageEnd, dateLabel, isDate, restrictionFor, validateRules } from './calendar.mjs';

const get = id => document.getElementById(id);
const rulesKey = `beijing-traffic-rules:${new URL('./', import.meta.url).pathname}`;
const appStore = 'https://apps.apple.com/cn/app/机关服务平台/id1523594749';
const relative = ['今天', '明天', '后天'];
const coverage = get('coverage');
const dayCards = get('three-days');
const dateInput = get('query-date');
const queryResult = get('query-result');
const notice = get('data-alert');
const bookingButton = get('booking-button');
const bookingHelp = get('booking-help');
const install = get('install');
const installHelp = get('install-help');
let latestRules = readSavedRules();
let today = beijingToday();
let submittedDate = '';
let offline = false;
let loading = false;
let launchLink;
let installPrompt;

function readSavedRules() {
  try {
    const saved = JSON.parse(localStorage.getItem(rulesKey));
    return validateRules(saved) ? saved : null;
  } catch {
    return null;
  }
}

async function fetchJson(path) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(new URL(path, import.meta.url), { cache: 'no-store', signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function buildCard(date, position) {
  const item = restrictionFor(date, latestRules);
  const card = get('day-template').content.firstElementChild.cloneNode(true);
  card.dataset.kind = item.kind;
  card.querySelector('h2').textContent = relative[position];
  const time = card.querySelector('time');
  time.dateTime = date;
  const weekday = document.createElement('span');
  weekday.textContent = item.weekday;
  time.append(`${dateLabel(date)} `, weekday);
  const label = card.querySelector('.restriction-label');
  const value = card.querySelector('.restriction-value');
  label.textContent = item.digits ? item.label : '尾号限行';
  if (item.digits) {
    const spokenDigits = document.createElement('span');
    spokenDigits.className = 'visually-hidden';
    spokenDigits.textContent = item.digits.join('和');
    value.append(spokenDigits);
    for (const number of item.digits) {
      const digit = document.createElement('span');
      digit.className = 'digit';
      digit.textContent = number;
      digit.setAttribute('aria-hidden', 'true');
      value.append(digit);
    }
  } else {
    value.textContent = item.label;
  }
  const detail = card.querySelector('.day-detail');
  detail.textContent = item.detail;
  detail.href = item.source;
  return card;
}

function renderQuery() {
  queryResult.replaceChildren();
  queryResult.hidden = !submittedDate;
  if (!submittedDate) return;
  const item = restrictionFor(submittedDate, latestRules);
  const caption = document.createElement('span');
  caption.className = 'result-label';
  caption.textContent = `${dateLabel(submittedDate, true)} ${item.weekday}`;
  const summary = document.createElement('div');
  summary.textContent = item.digits ? `${item.label} ${item.digits.join('、')}` : item.label;
  const detail = document.createElement('a');
  detail.href = item.source;
  detail.target = '_blank';
  detail.rel = 'noopener';
  detail.textContent = item.detail;
  queryResult.append(caption, summary, detail);
}

function render() {
  today = beijingToday();
  dateInput.min = today;
  dateInput.max = '9999-12-31';
  if (dateInput.value < today) dateInput.value = today;
  if (submittedDate < today) submittedDate = '';
  dayCards.replaceChildren(...relative.map((_, index) => buildCard(addDays(today, index), index)));
  renderQuery();

  const end = coverageEnd(latestRules);
  const messages = [];
  if (!latestRules) messages.push('暂时无法读取限行数据，请查看北京交管公告。');
  if (offline && latestRules) messages.push('暂时无法刷新限行数据，当前使用上次保存的规则。');
  if (end && today > end) messages.push('已收录的限行通告已到期，请以北京交管最新公告为准。');
  notice.textContent = messages.join(' ');
  notice.hidden = !messages.length;
  if (end) {
    coverage.textContent = `通告收录至 ${dateLabel(end, true)} · 规则核对于 ${dateLabel(latestRules.updated, true)}`;
    get('policy-link').href = latestRules.policies.find(policy => policy.rotations.some(rotation => rotation.until === end)).source;
  }
}

async function refreshRules() {
  if (loading) return;
  loading = true;
  try {
    const next = await fetchJson('./rules.json');
    if (!validateRules(next)) throw new Error('Invalid rule data');
    latestRules = next;
    offline = false;
    try { localStorage.setItem(rulesKey, JSON.stringify(next)); } catch { /* Storage may be disabled. */ }
  } catch {
    offline = true;
  } finally {
    loading = false;
    render();
  }
}

function getPlatform() {
  const agent = navigator.userAgent;
  if (/iPad|iPhone|iPod/i.test(agent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'ios';
  if (/HarmonyOS|OpenHarmony|HuaweiBrowser/i.test(agent)) return 'harmony';
  if (/Android/i.test(agent)) return 'android';
  return 'other';
}

const platform = getPlatform();

function getLaunchLink(value) {
  if (typeof value !== 'string') return;
  try {
    const url = new URL(value);
    const blocked = ['http:', 'javascript:', 'data:', 'file:', 'blob:', 'mailto:', 'tel:', 'sms:', 'itms-services:'];
    if (blocked.includes(url.protocol) || url.username || url.password) return;
    return url.href;
  } catch {
    return;
  }
}

function showBookingHelp() {
  const description = document.createElement('p');
  description.textContent = {
    ios: '如果 Safari 顶部显示「打开」，可点击进入「机关服务平台」。也可从主屏幕或 App Store 打开，随后进入用车预约。',
    android: '若预约 App 未打开，请在手机桌面或应用列表打开「机关服务平台」，随后进入用车预约。',
    harmony: '若预约 App 未打开，请在手机桌面打开「机关服务平台」，随后进入用车预约。',
    other: '请在手机上打开已安装的「机关服务平台」，随后进入用车预约。'
  }[platform];
  bookingHelp.replaceChildren(description);
  if (platform === 'ios' || platform === 'other') {
    const link = document.createElement('a');
    link.href = appStore;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = '查看 iOS App Store 页面';
    bookingHelp.append(link);
  }
  bookingHelp.hidden = false;
  bookingButton.setAttribute('aria-expanded', 'true');
}

bookingButton.addEventListener('click', () => {
  showBookingHelp();
  if (launchLink) window.location.assign(launchLink);
});
bookingButton.disabled = false;
fetchJson('./app-links.json').then(links => { launchLink = getLaunchLink(links?.[platform]); }).catch(() => {});

function isInstalled() {
  return navigator.standalone || matchMedia('(display-mode: standalone)').matches;
}

function showInstallHelp() {
  const instructions = {
    ios: '在 Safari 打开本页，点「分享」→「添加到主屏幕」。',
    android: '在 Chrome 打开本页，从浏览器菜单选择「安装应用」或「添加到主屏幕」。',
    harmony: '在系统浏览器打开本页，从菜单选择「添加到桌面」。选项名称因浏览器版本而异。',
    other: '在手机浏览器打开本页，从分享或浏览器菜单选择「添加到主屏幕」或「安装」。'
  };
  installHelp.textContent = instructions[platform];
  installHelp.hidden = !installHelp.hidden;
  install.setAttribute('aria-expanded', String(!installHelp.hidden));
}

install.hidden = Boolean(isInstalled());
window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  installPrompt = event;
});
install.addEventListener('click', async () => {
  if (!installPrompt) { showInstallHelp(); return; }
  const prompt = installPrompt;
  installPrompt = undefined;
  try { await prompt.prompt(); } catch { showInstallHelp(); }
});
window.addEventListener('appinstalled', () => {
  install.hidden = true;
  installHelp.hidden = true;
});

function queryDateIsValid() {
  const date = dateInput.value;
  dateInput.setCustomValidity(isDate(date) && date >= beijingToday() ? '' : '请选择今天或之后的有效日期。');
  return dateInput.reportValidity();
}

get('date-form').addEventListener('submit', event => {
  event.preventDefault();
  if (!queryDateIsValid()) return;
  submittedDate = dateInput.value;
  renderQuery();
});
dateInput.addEventListener('input', () => {
  dateInput.setCustomValidity('');
  submittedDate = '';
  renderQuery();
});
dateInput.value = today;
dateInput.min = today;
dateInput.disabled = false;
get('query-button').disabled = false;
if (latestRules) render();
refreshRules();
window.addEventListener('online', refreshRules);
window.addEventListener('offline', () => { offline = true; render(); });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  if (today !== beijingToday()) render();
  refreshRules();
});
setInterval(() => {
  if (today !== beijingToday()) { render(); refreshRules(); }
}, 15000);
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(error => console.warn('PWA cache unavailable', error));
}
