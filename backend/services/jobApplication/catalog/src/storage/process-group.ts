import { spawn } from 'node:child_process';

interface ProcessGroupOptions {
  cwd: string;
  env: NodeJS.ProcessEnv;
  timeoutMs: number;
  graceMs: number;
}
export interface ProcessGroupResult {
  exitCode: number;
  timedOut: boolean;
  cancelled: 'SIGINT' | 'SIGTERM' | undefined;
}

/** Supervise one owned POSIX process group. OS filesystem/network isolation belongs to its container. */
export function runProcessGroup(executable: string, args: readonly string[], options: ProcessGroupOptions): Promise<ProcessGroupResult> {
  return new Promise(resolveResult => {
    let settled = false;
    let timedOut = false;
    let cancelled: ProcessGroupResult['cancelled'];
    let leaderClosed = false;
    let leaderCode: number | null = null;
    let terminating = false;
    let hardKillSent = false;
    let hardDeadline: ReturnType<typeof setTimeout> | undefined;
    const child = spawn(executable, args, {
      cwd: options.cwd, env: options.env, shell: false, detached: true,
      stdio: ['ignore', 'ignore', 'ignore'],
    });
    const signalGroup = (signal: NodeJS.Signals) => {
      if (child.pid !== undefined) {
        try { process.kill(-child.pid, signal); } catch { /* A finished group may already be absent. */ }
      }
    };
    const finish = () => {
      // A leader can exit while descendants ignore the graceful signal. Keep the referenced
      // fallback timer and our signal handlers until the hard group signal has been sent.
      if (settled || !leaderClosed || (terminating && !hardKillSent)) return;
      settled = true;
      clearTimeout(deadline);
      if (hardDeadline !== undefined) clearTimeout(hardDeadline);
      process.off('SIGINT', interrupt);
      process.off('SIGTERM', stop);
      resolveResult({
        exitCode: timedOut ? 124 : cancelled === 'SIGINT' ? 130 : cancelled ? 143 : leaderCode === 0 ? 0 : 1,
        timedOut, cancelled,
      });
    };
    const terminate = (signal: 'SIGINT' | 'SIGTERM') => {
      if (settled) return;
      terminating = true;
      clearTimeout(deadline);
      signalGroup(signal);
      hardDeadline ??= setTimeout(() => {
        signalGroup('SIGKILL');
        hardKillSent = true;
        finish();
      }, options.graceMs);
    };
    const interrupt = () => { cancelled = 'SIGINT'; terminate('SIGINT'); };
    const stop = () => { cancelled = 'SIGTERM'; terminate('SIGTERM'); };
    process.once('SIGINT', interrupt);
    process.once('SIGTERM', stop);
    const deadline = setTimeout(() => { timedOut = true; terminate('SIGTERM'); }, options.timeoutMs);
    child.once('error', () => { leaderClosed = true; leaderCode = 1; finish(); });
    child.once('close', code => { leaderClosed = true; leaderCode = code; finish(); });
  });
}
