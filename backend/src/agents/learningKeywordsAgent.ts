import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { resolveProviderConfig } from '../utils/aiProvider';

type LearningKeywordInput = {
  direction: string;
  stage: string;
  goal: string;
};

const KEYWORD_COUNT = 20;

const createModel = (): ChatOpenAI => {
  const provider = resolveProviderConfig('deepseek');
  if (!provider) throw new Error('系统关键词模型配置异常');

  const apiKey =
    process.env.ARTICLE_ABSTRACT_DEEPSEEK_API_KEY ||
    process.env.ARTICLE_ABSTRACT_API_KEY ||
    process.env.ARTICLE_SUMMARY_API_KEY ||
    process.env.SUMMARY_DEEPSEEK_API_KEY ||
    '';

  if (!apiKey) throw new Error('系统关键词模型密钥未配置');

  const baseURL = provider.baseUrl.replace(/\/chat\/completions\/?$/, '');
  return new ChatOpenAI({
    openAIApiKey: apiKey,
    modelName: provider.models.default,
    temperature: 0.4,
    maxTokens: 600,
    streaming: false,
    configuration: { baseURL },
    modelKwargs: { thinking: { type: 'disabled' } }
  });
};

const parseKeywords = (raw: string): string[] => {
  const cleaned = raw.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
  let values: unknown[] = [];

  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) values = parsed;
  } catch {
    values = cleaned.replace(/[\[\]"']/g, '').split(/[,，、\n]+/);
  }

  const seen = new Set<string>();
  return values
    .filter((item): item is string => typeof item === 'string')
    .map(item => Array.from(item.trim()).slice(0, 24).join(''))
    .filter(item => {
      const key = item.toLocaleLowerCase();
      if (!item || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, KEYWORD_COUNT);
};

export const generateLearningKeywords = async (input: LearningKeywordInput): Promise<string[]> => {
  const model = createModel();
  const result = await model.invoke([
    new SystemMessage(`你是 Knowvia 的内容偏好关键词助手。根据学生主动填写的成长方向，生成恰好 ${KEYWORD_COUNT} 个用于推荐学习文章的关键词。关键词要具体、互不重复，兼顾知识主题、实践方向和当前目标；不要推断敏感信息，不要生成空泛词。每个关键词不超过 12 个中文字符或 24 个英文字符。只返回 JSON 字符串数组。`),
    new HumanMessage(`专业或发展方向：${input.direction || '未填写'}\n当前阶段：${input.stage || '未填写'}\n近期目标：${input.goal || '未填写'}`)
  ]);

  const raw = typeof result.content === 'string' ? result.content : '';
  const keywords = parseKeywords(raw);
  if (keywords.length !== KEYWORD_COUNT) {
    throw new Error('系统没有生成完整的关键词列表');
  }
  return keywords;
};
