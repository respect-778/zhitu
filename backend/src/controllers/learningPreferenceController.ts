import { Response } from 'express';
import { generateLearningKeywords } from '../agents/learningKeywordsAgent';
import { AuthRequest } from '../middleware/authMiddleware';
import { LearningPreferenceModel } from '../models/LearningPreference';
import { ResponseUtil } from '../utils/response';

const MAX_KEYWORDS = 20;

const cleanText = (value: unknown, maxLength: number): string => {
  if (typeof value !== 'string') return '';
  return Array.from(value.trim()).slice(0, maxLength).join('');
};

const cleanKeywords = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  return value
    .filter((item): item is string => typeof item === 'string')
    .map(item => Array.from(item.trim()).slice(0, 24).join(''))
    .filter(item => {
      const key = item.toLocaleLowerCase();
      if (!item || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_KEYWORDS);
};

export class LearningPreferenceController {
  static async get(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.userId) {
        res.status(401).json(ResponseUtil.error('未授权'));
        return;
      }

      const preferences = await LearningPreferenceModel.findByUserId(req.userId);
      res.json(ResponseUtil.success('获取成功', preferences));
    } catch (error) {
      console.error('获取成长方向失败:', error);
      res.status(500).json(ResponseUtil.error('获取成长方向失败'));
    }
  }

  static async update(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.userId) {
        res.status(401).json(ResponseUtil.error('未授权'));
        return;
      }

      const data = {
        direction: cleanText(req.body?.direction, 80),
        stage: cleanText(req.body?.stage, 30),
        goal: cleanText(req.body?.goal, 50),
        keywords: cleanKeywords(req.body?.keywords)
      };

      await LearningPreferenceModel.upsert(req.userId, data);
      res.json(ResponseUtil.success('保存成功', data));
    } catch (error) {
      console.error('保存成长方向失败:', error);
      res.status(500).json(ResponseUtil.error('保存失败'));
    }
  }

  static async generateKeywords(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.userId) {
        res.status(401).json(ResponseUtil.error('未授权'));
        return;
      }

      const input = {
        direction: cleanText(req.body?.direction, 80),
        stage: cleanText(req.body?.stage, 30),
        goal: cleanText(req.body?.goal, 50)
      };

      if (!input.direction && !input.stage && !input.goal) {
        res.status(400).json(ResponseUtil.error('请先填写至少一项成长方向'));
        return;
      }

      const keywords = await generateLearningKeywords(input);
      res.json(ResponseUtil.success('生成成功', keywords));
    } catch (error) {
      console.error('生成推荐关键词失败:', error);
      res.status(500).json(ResponseUtil.error('关键词生成暂不可用，请稍后重试'));
    }
  }
}
