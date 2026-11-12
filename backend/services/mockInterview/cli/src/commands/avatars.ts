/**
 * `deepinterview avatars pull`            — fetch + SHA-256-verify accepted packs
 * `deepinterview avatars verify <files…>` — contributor pre-flight on local files
 *
 * The manifest (repo-root `avatars.manifest.json`) is the source of truth for
 * what ships; assets land in the gitignored `apps/web/public/avatars/`. The
 * app renders its gradient fallback when files are absent, so `pull` is always
 * optional. See docs/AVATARS.md.
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import {
  checkFileBytes,
  parseManifest,
  sha256Hex,
  type AvatarManifest,
} from "../lib/avatar-manifest";

const MANIFEST_PATH = "avatars.manifest.json";
const DEST_DIR = join("apps", "web", "public", "avatars");

async function loadManifest(): Promise<AvatarManifest> {
  if (!existsSync(MANIFEST_PATH)) {
    throw new Error(
      `${MANIFEST_PATH} not found — run from the repo root (pnpm deepinterview avatars pull).`,
    );
  }
  return parseManifest(await readFile(MANIFEST_PATH, "utf8"));
}

async function pull(): Promise<void> {
  const manifest = await loadManifest();
  const files = manifest.packs.flatMap((p) =>
    p.files.map((f) => ({ ...f, persona: p.persona })),
  );
  if (files.length === 0) {
    console.log("Manifest has no published packs yet — nothing to pull.");
    console.log(
      "The app renders its gradient avatar stage until packs land (docs/AVATARS.md).",
    );
    return;
  }
  await mkdir(DEST_DIR, { recursive: true });

  let fetched = 0;
  let skipped = 0;
  let failed = 0;
  for (const file of files) {
    const dest = join(DEST_DIR, file.name);
    if (existsSync(dest)) {
      const existing = sha256Hex(await readFile(dest));
      if (existing === file.sha256) {
        console.log(`  ok        ${file.name} (already verified)`);
        skipped++;
        continue;
      }
      console.log(
        `  refetch   ${file.name} (local file does not match manifest)`,
      );
    }
    try {
      const res = await fetch(file.url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      const hash = sha256Hex(bytes);
      if (hash !== file.sha256) {
        throw new Error(
          `SHA-256 mismatch (expected ${file.sha256.slice(0, 12)}…, got ${hash.slice(0, 12)}…)`,
        );
      }
      await writeFile(dest, bytes);
      console.log(
        `  fetched   ${file.name} (${(bytes.byteLength / 1024 / 1024).toFixed(1)} MB, verified)`,
      );
      fetched++;
    } catch (cause) {
      await rm(dest, { force: true });
      console.error(`  FAILED    ${file.name}: ${String(cause)}`);
      failed++;
    }
  }
  console.log(
    `\n${fetched} fetched, ${skipped} already verified, ${failed} failed → ${DEST_DIR}/`,
  );
  if (failed > 0) process.exitCode = 1;
}

async function verify(paths: string[]): Promise<void> {
  if (paths.length === 0) {
    console.error(
      "Usage: deepinterview avatars verify <file.mp4|file.jpg> […]",
    );
    process.exitCode = 1;
    return;
  }
  let errors = 0;
  for (const path of paths) {
    let bytes: Uint8Array;
    try {
      bytes = await readFile(path);
    } catch (cause) {
      console.error(`  error     ${path}: cannot read (${String(cause)})`);
      errors++;
      continue;
    }
    const issues = checkFileBytes(basename(path), bytes);
    const fileErrors = issues.filter((i) => i.level === "error");
    errors += fileErrors.length;
    const verdict = fileErrors.length > 0 ? "error" : "ok";
    console.log(
      `  ${verdict.padEnd(9)} ${basename(path)}  sha256=${sha256Hex(bytes)}`,
    );
    for (const issue of issues)
      console.log(`            ${issue.level}: ${issue.message}`);
  }
  console.log(
    errors > 0
      ? "\nFix the errors above before submitting (contract: docs/AVATARS.md)."
      : "\nTechnical contract OK. Paste the sha256 lines into your PR — a maintainer" +
          "\nstill reviews the content itself (IP-safety checklist) before acceptance.",
  );
  if (errors > 0) process.exitCode = 1;
}

export async function runAvatars(args: string[]): Promise<void> {
  const [sub, ...rest] = args;
  if (sub === "pull") return pull();
  if (sub === "verify") return verify(rest);
  console.error("Usage: deepinterview avatars <pull | verify <files…>>");
  process.exitCode = 1;
}
