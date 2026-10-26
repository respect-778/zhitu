import dotenv from 'dotenv';
import { generateArticleAbstract } from '../agents/articleAbstractAgent';
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
    delayMs: 0,
    dryRun: false
  };

  for (const arg of argv) {
    if (arg === '--force') {
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
  const posts = await PostModel.findForAbstractBackfill({
    force: options.force,
    limit: options.limit ?? undefined
  });

  if (posts.length === 0) {
    console.log('No posts matched the abstract backfill conditions.');
    return;
  }

  console.log(
    `Starting abstract backfill for ${posts.length} posts` +
      `${options.force ? ' (force mode)' : ''}` +
      `${options.dryRun ? ' (dry run)' : ''}.`
  );

  let successCount = 0;
  let failedCount = 0;
  let skippedCount = 0;

  for (const post of posts) {
    const title = typeof post.title === 'string' ? post.title.trim() : '';
    const content = typeof post.content === 'string' ? post.content.trim() : '';

    if (!content) {
      skippedCount += 1;
      console.warn(`Skipping post #${post.id}: content is empty.`);
      continue;
    }

    try {
      const abstract = await generateArticleAbstract({ title, content });

      if (options.dryRun) {
        console.log(`[dry-run] post #${post.id}: ${abstract}`);
      } else {
        await PostModel.updateAbstract(post.id, abstract);
        console.log(`Updated post #${post.id}`);
      }

      successCount += 1;
    } catch (error: any) {
      failedCount += 1;
      const message = typeof error?.message === 'string' ? error.message : String(error);
      console.error(`Failed to generate abstract for post #${post.id}: ${message}`);
    }

    if (options.delayMs > 0) {
      await sleep(options.delayMs);
    }
  }

  console.log(
    `Done. success=${successCount}, skipped=${skippedCount}, failed=${failedCount}, total=${posts.length}`
  );

  if (failedCount > 0) {
    process.exitCode = 1;
  }
}

void main().catch((error: any) => {
  const message = typeof error?.message === 'string' ? error.message : String(error);
  console.error(`Abstract backfill script failed: ${message}`);
  process.exit(1);
});
