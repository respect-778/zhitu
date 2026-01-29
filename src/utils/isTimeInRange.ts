type TimeRange = '今天' | '昨天' | '7天内' | '30天内';

/**
 * 判断目标时间是否在指定时间范围内
 * 特殊逻辑：
 * - 7天内：不包含今天和昨天，指往前推的第2-8天（共7天）
 * - 30天内：不包含今天、昨天和7天内，指往前推的第9-38天（共30天）
 * 
 * @param targetTime - 目标时间（Date对象、ISO字符串或时间戳）
 * @param range - 时间范围（今天/昨天/7天内/30天内）
 * @returns boolean - 是否在范围内
 */
export function isTimeInRange(targetTime: Date | string | number, range: TimeRange): boolean {
  // 转换目标时间为时间戳
  const target = new Date(targetTime).getTime();

  // 检查是否有效日期
  if (isNaN(target)) {
    console.warn('[isTimeInRange] 无效的时间格式:', targetTime);
    return false;
  }

  const now = new Date();
  // 获取今天 00:00:00 的时间戳（本地时间）
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const oneDay = 24 * 60 * 60 * 1000; // 一天的毫秒数

  switch (range) {
    case '今天':
      // 今天 00:00:00 到 23:59:59.999
      return target >= todayStart && target < todayStart + oneDay;

    case '昨天':
      // 昨天 00:00:00 到 23:59:59.999
      return target >= todayStart - oneDay && target < todayStart;

    case '7天内':
      // 7天内 = 过去7天，不包括今天(0)和昨天(-1)
      // 范围：往前推第2天(-2) 到 第8天(-8)
      // 即时间戳范围：[todayStart-8天, todayStart-1天)
      const sevenDaysStart = todayStart - 8 * oneDay; // 第8天开始（前天往前7天）
      const sevenDaysEnd = todayStart - oneDay; // 昨天开始（不包含）
      return target >= sevenDaysStart && target < sevenDaysEnd;

    case '30天内':
      // 30天内 = 过去30天，不包括今天(0)、昨天(-1)和7天内(-2到-8)
      // 7天内占用了第2-8天（共7天），加上今天昨天（2天），共排除9天
      // 范围：往前推第9天(-9) 到 第38天(-38)
      // 即时间戳范围：[todayStart-38天, todayStart-8天)
      const thirtyDaysStart = todayStart - 38 * oneDay; // 第38天开始
      const thirtyDaysEnd = todayStart - 8 * oneDay; // 第8天开始（不包含，因为-8属于7天内）
      return target >= thirtyDaysStart && target < thirtyDaysEnd;

    default:
      return false;
  }
}