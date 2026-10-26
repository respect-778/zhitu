/**
 * 批量生成文章关键词脚本
 *
 * 用法：
 *   npm run keywords:backfill                     # 只为缺少关键词的文章生成
 *   npm run keywords:backfill -- --overwrite        # 为所有文章重新生成（覆盖已有）
 *   npm run keywords:backfill -- --limit=10        # 只处理前 10 篇
 *   npm run keywords:backfill -- --delay=2000      # 每篇之间等 2 秒（避免触发 API 限流）
 *   npm run keywords:backfill -- --dry-run         # 只打印，不写库
 */

import dotenv from 'dotenv';
import { generateArticleKeywords } from '../agents/articleKeywordsAgent';
import { PostModel } from '../models/Post';

dotenv.config();

type ScriptOptions = {
  force: boolean;
  limit: number | null;
  delayMs: number;
  dryRun: boolean;
};

const parsePositiveInteger = (value: string, flagName: string): number => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid value for ${flagName}: ${value}`);
  }

  return parsed;
};

const parseArgs = (argv: string[]): ScriptOptions => {
  const options: ScriptOptions = {
    force: false,
    limit: null,
    delayMs: 1000,
    dryRun: false
  };

  for (const arg of argv) {
    if (arg === '--force' || arg === '--overwrite') {
      options.force = true;
      continue;
    }

    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }

    if (arg.startsWith('--limit=')) {
      options.limit = parsePositiveInteger(arg.slice('--limit='.length), '--limit');
      continue;
    }

    if (arg.startsWith('--delay=')) {
      options.delayMs = parsePositiveInteger(arg.slice('--delay='.length), '--delay');
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
};

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const posts = await PostModel.findForKeywordsBackfill({
    force: options.force,
    limit: options.limit ?? undefined
  });

  if (posts.length === 0) {
    console.log('No posts matched the keywords backfill conditions.');
    return;
  }

  console.log(
    `Starting keywords backfill for ${posts.length} posts` +
    `${options.force ? ' (force mode)' : ''}` +
    `${options.dryRun ? ' (dry run)' : ''}` +
    `${options.delayMs > 0 ? ` (delay=${options.delayMs}ms)` : ''}.`
  );

  let successCount = 0;
  let failedCount = 0;
  let skippedCount = 0;

  for (let i = 0; i < posts.length; i++) {
    const post = posts[i];
    const title = typeof post.title === 'string' ? post.title.trim() : '';
    const content = typeof post.content === 'string' ? post.content.trim() : '';

    if (!content) {
      skippedCount += 1;
      console.warn(`[${i + 1}/${posts.length}] Skipping post #${post.id}: content is empty.`);
      continue;
    }

    try {
      const keywords = await generateArticleKeywords({ title, content });

      if (options.dryRun) {
        console.log(`[${i + 1}/${posts.length}] [dry-run] post #${post.id}: ${JSON.stringify(keywords)}`);
      } else {
        await PostModel.updateKeywords(post.id, keywords);
        console.log(`[${i + 1}/${posts.length}] Updated post #${post.id}: ${JSON.stringify(keywords)}`);
      }

      successCount += 1;
    } catch (error: any) {
      failedCount += 1;
      const message = typeof error?.message === 'string' ? error.message : String(error);
      console.error(`[${i + 1}/${posts.length}] Failed post #${post.id}: ${message}`);
    }

    if (i < posts.length - 1 && options.delayMs > 0) {
      await sleep(options.delayMs);
    }
  }

  console.log(
    `\nDone. success=${successCount}, skipped=${skippedCount}, failed=${failedCount}, total=${posts.length}`
  );

  if (failedCount > 0) {
    process.exitCode = 1;
  }
}

void main().catch((error: any) => {
  const message = typeof error?.message === 'string' ? error.message : String(error);
  console.error(`Keywords backfill script failed: ${message}`);
  process.exit(1);
});
