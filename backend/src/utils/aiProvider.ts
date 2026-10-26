export type ProviderApiStyle = 'openai' | 'anthropic';

export interface ProviderConfig {
  canonicalName: string;
  baseUrl: string;
  apiStyle: ProviderApiStyle;
  models: {
    default: string;
    reasoning: string;
  };
}

// AI提供者配置映射
const PROVIDER_CONFIG_MAP: Record<string, ProviderConfig> = {
  anthropic: {
    canonicalName: 'Anthropic',
    baseUrl: 'https://api.anthropic.com/v1/messages',
    apiStyle: 'anthropic',
    models: {
      default: process.env.ANTHROPIC_MODEL_DEFAULT || 'claude-3-5-haiku-latest',
      reasoning: process.env.ANTHROPIC_MODEL_REASONING || 'claude-3-7-sonnet-latest'
    }
  },
  openai: {
    canonicalName: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1/chat/completions',
    apiStyle: 'openai',
    models: {
      default: process.env.OPENAI_MODEL_DEFAULT || 'gpt-4.1-mini',
      reasoning: process.env.OPENAI_MODEL_REASONING || 'o4-mini'
    }
  },
  google: {
    canonicalName: 'Google',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    apiStyle: 'openai',
    models: {
      default: process.env.GOOGLE_MODEL_DEFAULT || 'gemini-2.5-flash',
      reasoning: process.env.GOOGLE_MODEL_REASONING || 'gemini-2.5-pro'
    }
  },
  moonshot: {
    canonicalName: 'Moonshot',
    baseUrl: 'https://api.moonshot.cn/v1/chat/completions',
    apiStyle: 'openai',
    models: {
      default: process.env.MOONSHOT_MODEL_DEFAULT || 'kimi-k2.6',
      reasoning: process.env.MOONSHOT_MODEL_REASONING || 'kimi-k2.6'
    }
  },
  deepseek: {
    canonicalName: 'Deepseek',
    baseUrl: 'https://api.deepseek.com/v1/chat/completions',
    apiStyle: 'openai',
    models: {
      default: process.env.DEEPSEEK_MODEL_DEFAULT || 'deepseek-v4-flash',
      reasoning: process.env.DEEPSEEK_MODEL_REASONING || 'deepseek-v4-pro'
    }
  },
  qwen: {
    canonicalName: 'Qwen',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    apiStyle: 'openai',
    models: {
      default: process.env.QWEN_MODEL_DEFAULT || 'qwen-plus',
      reasoning: process.env.QWEN_MODEL_REASONING || 'qwen-max'
    }
  },
  glm: {
    canonicalName: 'GLM',
    baseUrl: process.env.GLM_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    apiStyle: 'openai',
    models: {
      default: process.env.GLM_MODEL || 'glm-4',
      reasoning: process.env.GLM_MODEL_FAST || 'glm-4-flash'
    }
  }
};

export const resolveProviderConfig = (providerName: string): ProviderConfig | null => {
  const key = providerName.trim().toLowerCase();
  if (!key) return null;
  return PROVIDER_CONFIG_MAP[key] || null;
};

export const getModelByMode = (provider: ProviderConfig, mode: number): string => {
  return mode === 1 ? provider.models.reasoning : provider.models.default;
};

export const getProviderModelsEndpoint = (provider: ProviderConfig): string | null => {
  const key = provider.canonicalName.trim().toLowerCase();
  if (key === 'google') return null;

  if (key === 'anthropic') return 'https://api.anthropic.com/v1/models';
  if (key === 'openai') return 'https://api.openai.com/v1/models';
  if (key === 'deepseek') return 'https://api.deepseek.com/v1/models';
  if (key === 'moonshot') return 'https://api.moonshot.cn/v1/models';
  if (key === 'qwen') return 'https://dashscope.aliyuncs.com/compatible-mode/v1/models';
  if (key === 'glm') return 'https://open.bigmodel.cn/api/paas/v4/models';

  return null;
};

export const extractModelIdsFromResponse = (payload: unknown): string[] => {
  const ids: string[] = [];
  const pushId = (value: unknown) => {
    if (typeof value !== 'string') return;
    const trimmed = value.trim();
    if (!trimmed) return;
    if (!ids.includes(trimmed)) ids.push(trimmed);
  };

  const readArray = (arr: unknown[]) => {
    arr.forEach((item) => {
      if (typeof item === 'string') {
        pushId(item);
        return;
      }
      if (item && typeof item === 'object') {
        const row = item as Record<string, unknown>;
        pushId(row.id);
        pushId(row.model);
        pushId(row.name);
      }
    });
  };

  if (payload && typeof payload === 'object') {
    const body = payload as Record<string, unknown>;
    if (Array.isArray(body.data)) readArray(body.data);
    if (Array.isArray(body.models)) readArray(body.models);

    const result = body.result;
    if (result && typeof result === 'object') {
      const resultObj = result as Record<string, unknown>;
      if (Array.isArray(resultObj.models)) readArray(resultObj.models);
      if (Array.isArray(resultObj.data)) readArray(resultObj.data);
    }
  }

  return ids;
};

const matchPreferredModel = (models: string[], candidates: string[]): string | null => {
  const lowerMap = new Map(models.map((m) => [m.toLowerCase(), m]));
  for (const candidate of candidates) {
    const hit = lowerMap.get(candidate.toLowerCase());
    if (hit) return hit;
  }
  return null;
};

const getFallbackCandidates = (provider: ProviderConfig, mode: number): string[] => {
  const key = provider.canonicalName.trim().toLowerCase();
  if (key === 'deepseek') {
    if (mode === 1) return ['deepseek-reasoner', 'deepseek-r1', 'deepseek-chat'];
    return ['deepseek-chat', 'deepseek-v3', 'deepseek-reasoner'];
  }

  if (key === 'openai') {
    if (mode === 1) return ['o4-mini', 'o3-mini', 'gpt-4.1'];
    return ['gpt-4.1-mini', 'gpt-4o-mini', 'gpt-4o'];
  }

  if (key === 'anthropic') {
    if (mode === 1) return ['claude-3-7-sonnet-latest', 'claude-sonnet-4-0'];
    return ['claude-3-5-haiku-latest', 'claude-3-haiku-20240307'];
  }

  return [];
};

export const pickBestModelFromList = (
  provider: ProviderConfig,
  mode: number,
  models: string[]
): string => {
  if (models.length === 0) return getModelByMode(provider, mode);

  const preferred = [getModelByMode(provider, mode), ...getFallbackCandidates(provider, mode)];
  const matched = matchPreferredModel(models, preferred);
  if (matched) return matched;

  return models[0];
};

const getVersionByModelName = (providerName: string, modelName: string): string => {
  const key = providerName.trim().toLowerCase();
  const model = modelName.trim().toLowerCase();

  if (key === 'deepseek') {
    if (model === 'deepseek-chat') return process.env.DEEPSEEK_MODEL_DEFAULT_VERSION || 'v3';
    if (model === 'deepseek-reasoner') return process.env.DEEPSEEK_MODEL_REASONING_VERSION || 'r1';

    const matched = model.match(/deepseek[-_]?v?(\d+(?:\.\d+)*)/i);
    if (matched?.[1]) return `v${matched[1]}`;
  }

  if (key === 'glm') {
    if (model.includes('glm-4')) return process.env.GLM_MODEL_VERSION || 'v4';
  }

  return modelName;
};

export const getModelDisplayLabel = (provider: ProviderConfig, modelName: string): string => {
  const providerName = provider.canonicalName;
  const key = providerName.trim().toLowerCase();
  const model = modelName.trim().toLowerCase();

  if (key === 'deepseek') {
    if (model === 'deepseek-chat') return 'DeepSeek-v3';
    if (model === 'deepseek-reasoner') return 'DeepSeek-R1';

    const matched = model.match(/deepseek[-_]?v?(\d+(?:\.\d+)*)/i);
    if (matched?.[1]) return `DeepSeek-v${matched[1]}`;
  }

  return `${providerName}-${modelName}`;
};

export const getModelVersionByMode = (provider: ProviderConfig, mode: number): string => {
  const modelName = getModelByMode(provider, mode);
  return getVersionByModelName(provider.canonicalName, modelName);
};
