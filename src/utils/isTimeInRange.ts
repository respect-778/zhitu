type TimeRange = '今天' | '昨天' | '7天内' | '30天内';

const ONE_DAY = 24 * 60 * 60 * 1000;

const parseDate = (value: Date | string | number): Date | null => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const text = value.trim();
  if (!text) return null;

  const localDateTime = text.match(
    /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?(?:\.\d+)?)?$/
  );

  if (localDateTime) {
    const [, year, month, day, hour = '0', minute = '0', second = '0'] = localDateTime;
    const date = new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second)
    );
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
};

const getLocalDayStart = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

/**
 * 判断目标时间是否在指定时间范围内。
 *
 * 分组互斥：
 * - 今天：当天
 * - 昨天：昨天
 * - 7天内：前 2-7 天
 * - 30天内：前 8-30 天
 */
export function isTimeInRange(targetTime: Date | string | number, range: TimeRange): boolean {
  const targetDate = parseDate(targetTime);

  if (!targetDate) {
    console.warn('[isTimeInRange] 无效的时间格式:', targetTime);
    return false;
  }

  const todayStart = getLocalDayStart(new Date());
  const targetDayStart = getLocalDayStart(targetDate);
  const diffDays = Math.floor((todayStart - targetDayStart) / ONE_DAY);

  switch (range) {
    case '今天':
      return diffDays === 0;

    case '昨天':
      return diffDays === 1;

    case '7天内':
      return diffDays >= 2 && diffDays <= 7;

    case '30天内':
      return diffDays >= 8 && diffDays <= 30;

    default:
      return false;
  }
}
