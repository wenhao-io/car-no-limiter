const beijingFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit'
});
const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
const noticeIndex = 'https://jtgl.beijing.gov.cn/jgj/jgxx/gsgg/jttg/bjsgajgajtgljtg/';

export function beijingToday(now = new Date()) {
  const parts = Object.fromEntries(beijingFormatter.formatToParts(now).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function addDays(iso, days) {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function dateLabel(iso, full = false) {
  const [year, month, day] = iso.split('-').map(Number);
  return `${full ? `${year}年` : ''}${month}月${day}日`;
}

export function isDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

const includesDate = ({ from, until }, date) => from <= date && date <= until;

export function validateRules(data) {
  const isSource = value => typeof value === 'string' && /^https:\/\/(?:www\.beijing\.gov\.cn|jtgl\.beijing\.gov\.cn|www\.gov\.cn)\//.test(value);
  const isRange = rule => rule && isDate(rule.from) && isDate(rule.until) && rule.from <= rule.until;
  if (data?.version !== 1 || !isDate(data.updated) || !Array.isArray(data.policies) || !data.policies.length ||
      !Array.isArray(data.exemptions) || !data.calendars || typeof data.calendars !== 'object') return false;
  const validPolicies = data.policies.every(policy => policy && isSource(policy.source) &&
    Array.isArray(policy.rotations) && policy.rotations.length > 0 && policy.rotations.every(rule =>
      isRange(rule) && Array.isArray(rule.weekdays) && rule.weekdays.length === 5 &&
      rule.weekdays.every(pair => ['05', '50', '16', '27', '38', '49'].includes(pair)) && new Set(rule.weekdays.map(pair => pair === '05' ? '50' : pair)).size === 5));
  const validCalendars = Object.entries(data.calendars).every(([year, calendar]) => calendar && isSource(calendar.source) &&
    Array.isArray(calendar.holidays) && calendar.holidays.every(rule => isRange(rule) && typeof rule.name === 'string' &&
      rule.from.startsWith(`${year}-`) && rule.until.startsWith(`${year}-`)) &&
    Array.isArray(calendar.makeupDays) && calendar.makeupDays.every(day => isDate(day) && day.startsWith(`${year}-`)));
  if (!validPolicies || !validCalendars || !data.exemptions.every(rule => isRange(rule) && isSource(rule.source))) return false;
  const rotations = data.policies.flatMap(policy => policy.rotations).sort((a, b) => a.from.localeCompare(b.from));
  return rotations.every((rule, index) => index === 0 || rotations[index - 1].until < rule.from);
}

export function coverageEnd(data) {
  return data?.policies.flatMap(policy => policy.rotations.map(rule => rule.until)).sort().at(-1);
}

export function restrictionFor(iso, data) {
  const weekdayIndex = new Date(`${iso}T00:00:00Z`).getUTCDay();
  const weekday = weekdays[weekdayIndex];
  const policy = data?.policies.find(item => item.rotations.some(rule => includesDate(rule, iso)));
  const rotation = policy?.rotations.find(rule => includesDate(rule, iso));
  if (!rotation) return { weekday, kind: 'unknown', label: '待公告', detail: data ? '此日期超出已收录的限行通告范围' : '暂时无法读取限行数据', source: noticeIndex };

  const calendar = data.calendars[iso.slice(0, 4)];
  const holiday = calendar?.holidays.find(rule => includesDate(rule, iso));
  const makeup = calendar?.makeupDays.includes(iso);
  const exemption = data.exemptions.find(rule => includesDate(rule, iso));
  const weekend = weekdayIndex === 0 || weekdayIndex === 6;
  const removed = { weekday, kind: 'free', label: '不限行' };

  if (exemption) return { ...removed, detail: `${holiday?.name || (makeup ? '周末调休上班' : '临时调整')} · 交管已公告`, source: exemption.source };
  if (weekend) return { ...removed, detail: makeup ? '周末调休上班 · 尾号不限行' : `${holiday ? `${holiday.name} · ` : ''}周末尾号不限行`, source: policy.source };
  if (!calendar) return { weekday, kind: 'unknown', label: '待确认', detail: '尚未收录该年度节假日安排', source: noticeIndex };
  if (holiday) return { weekday, kind: 'projected', label: '预计不限行', detail: `${holiday.name}放假 · 请留意北京交管公告`, source: calendar.source };

  return { weekday, kind: 'limited', label: '限行尾号', digits: [...rotation.weekdays[weekdayIndex - 1]], source: policy.source };
}
