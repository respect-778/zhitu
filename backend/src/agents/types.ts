import type { ProviderConfig } from '../utils/aiProvider';

// 已解析的AI提供者
export interface ResolvedProvider {
  provider: ProviderConfig;
  apiKey: string;
  url: string;
}

// 构建消息参数
export interface BuildMessageParams {
  sessionId: number | null;
  userMessage: string;
  userId: number;
  mode: number;
}

// AI代理配置接口
export interface AgentConfig {
  resolveProvider(userId: number): Promise<ResolvedProvider>;
  buildMessages(params: BuildMessageParams): Promise<Array<{ role: string; content: string }>>;
}