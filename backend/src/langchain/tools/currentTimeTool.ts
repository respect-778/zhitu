/**
 * ========================================================================
 * 当前时间工具 (Current Time Tool)
 * ========================================================================
 *
 * 【作用】
 * 让 AI 知道当前的真实时间。
 * 大模型的训练数据有截止日期，它不知道 "现在" 是什么时候，
 * 可能会把 2025 年的事情当成 "最近"，或说出错误的日期。
 *
 * 【使用场景】
 * - 用户问 "最新的 XX 是什么时候发布的"
 * - 用户问 "今天是几号"
 * - 需要判断信息时效性时
 *
 * 【为什么是工具而不是系统提示词】
 * 系统提示词中写死的日期是静态的，需要手动维护。
 * 工具是动态调用的，每次调用都返回实时时间，永远准确。
 * ========================================================================
 */

import { tool } from '@langchain/core/tools';
import { z } from 'zod';

/**
 * 创建当前时间工具
 *
 * Agent 在需要时间信息时会自动调用这个工具。
 * 返回包含日期、时间、星期、时区的完整时间字符串。
 */
export const createCurrentTimeTool = () => {
  // @ts-expect-error -- LangChain tool() 的泛型层级过深
  return tool(
    async () => {
      const now = new Date();

      // 格式化为中文友好的时间字符串
      const year = now.getFullYear();
      const month = now.getMonth() + 1;
      const day = now.getDate();
      const hours = now.getHours().toString().padStart(2, '0');
      const minutes = now.getMinutes().toString().padStart(2, '0');

      const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
      const weekDay = weekDays[now.getDay()];

      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

      return `当前时间：${year}年${month}月${day}日 ${hours}:${minutes}，星期${weekDay}，时区：${timeZone}`;
    },
    {
      name: 'get_current_time',
      description: '获取当前的真实日期和时间。当用户询问与时间相关的问题（如"最新的"、"今天"、"现在"），或需要判断信息是否过时时，调用此工具获取准确的当前时间。',
      schema: z.object({}),
    }
  );
};
