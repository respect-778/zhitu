import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { runProcessGroup } from '../src/storage/process-group.ts';

const linuxOnly = process.platform === 'linux' ? false : 'POSIX process-group regression runs in the isolated Linux container.';

function processState(pid: number): string | null {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
    return stat.slice(stat.lastIndexOf(')') + 2).split(' ')[0];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}
async function until(check: () => boolean, maximumMs: number): Promise<void> {
  const deadline = Date.now() + maximumMs;
  while (!check()) {
    assert.ok(Date.now() < deadline, 'the expected bounded process state was not reached');
    await delay(20);
  }
}

for (const mode of ['timeout', 'cancel'] as const) {
  test(`process-group ${mode} kills a descendant that ignores SIGTERM after its leader exits`, { skip: linuxOnly, timeout: 10_000 }, async t => {
    const directory = mkdtempSync(join(tmpdir(), 'catalog-group-test-'));
    const readyFile = join(directory, 'ready.json');
    const exitFile = join(directory, 'leader-exited');
    let group: { leader: number; descendant: number } | undefined;
    t.after(() => {
      if (group && ![null, 'Z', 'X'].includes(processState(group.descendant))) {
        try { process.kill(-group.leader, 'SIGKILL'); } catch { /* best effort for a failed regression */ }
      }
      rmSync(directory, { recursive: true, force: true });
    });
    const descendant = `
      process.on('SIGTERM', () => {});
      process.on('SIGINT', () => {});
      setInterval(() => {}, 1000);
      process.send({ pid: process.pid });
      process.disconnect();
    `;
    const leader = `
      const { spawn } = require('node:child_process');
      const { writeFileSync } = require('node:fs');
      const stopped = signal => { writeFileSync(process.argv[2], signal); process.exit(0); };
      process.on('SIGTERM', () => stopped('SIGTERM'));
      process.on('SIGINT', () => stopped('SIGINT'));
      const child = spawn(process.execPath, ['-e', ${JSON.stringify(descendant)}], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
      child.once('message', value => writeFileSync(process.argv[1], JSON.stringify({ leader: process.pid, descendant: value.pid })));
      setInterval(() => {}, 1000);
    `;
    let completed = false;
    const outcome = runProcessGroup(process.execPath, ['-e', leader, readyFile, exitFile], {
      cwd: directory, env: { PATH: '/usr/local/bin:/usr/bin:/bin' }, timeoutMs: mode === 'timeout' ? 2_000 : 8_000, graceMs: 400,
    }).then(result => { completed = true; return result; });
    await until(() => {
      try { group = JSON.parse(readFileSync(readyFile, 'utf8')); return true; }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
    }, 1_500);
    if (mode === 'cancel') process.kill(process.pid, 'SIGTERM');
    await until(() => {
      try { return readFileSync(exitFile, 'utf8') === 'SIGTERM'; }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
    }, 3_000);
    await until(() => [null, 'Z', 'X'].includes(processState(group!.leader)), 300);
    assert.equal(completed, false, 'leader exit must not settle before descendant cleanup');
    assert.ok(![null, 'Z', 'X'].includes(processState(group!.descendant)), 'the descendant must still be alive during the grace period');
    const result = await outcome;
    assert.equal(result.exitCode, mode === 'timeout' ? 124 : 143);
    assert.equal(result.timedOut, mode === 'timeout');
    await until(() => [null, 'Z', 'X'].includes(processState(group!.descendant)), 1_000);
    t.diagnostic(JSON.stringify({ mode, leaderExitedBeforeCleanup: true, descendantStopped: true, exitCode: result.exitCode }));
  });
}

test('normal process exit does not wait for a termination grace period or retain signal listeners', { skip: linuxOnly, timeout: 5_000 }, async () => {
  const before = { interrupt: process.listenerCount('SIGINT'), stop: process.listenerCount('SIGTERM') };
  const result = await runProcessGroup(process.execPath, ['-e', 'process.exit(0)'], {
    cwd: tmpdir(), env: {}, timeoutMs: 2_000, graceMs: 4_000,
  });
  assert.equal(result.exitCode, 0);
  assert.equal(result.timedOut, false);
  assert.equal(process.listenerCount('SIGINT'), before.interrupt);
  assert.equal(process.listenerCount('SIGTERM'), before.stop);
});
