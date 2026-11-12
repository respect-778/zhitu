/**
 * Avatar pack manifest — the repo's tamper-evident ledger of accepted packs.
 *
 * `avatars.manifest.json` (repo root) pins every published avatar file to a
 * SHA-256 recorded at acceptance (see docs/AVATARS.md). `avatars pull`
 * downloads + verifies against it; `avatars verify` computes hashes and
 * checks the technical contract for files about to be submitted. Pure
 * parsing/validation lives here so it's unit-testable; commands do the I/O.
 */
import { createHash } from "node:crypto";

export interface ManifestFile {
  /** Filename as served from /avatars/, e.g. "recruiter-idle.mp4". */
  name: string;
  /** Lowercase hex SHA-256 of the exact accepted bytes. */
  sha256: string;
  /** Download URL (GitHub Release asset — maintainer-controlled hosting). */
  url: string;
}

export interface ManifestPack {
  /** Persona id (must match apps/web/lib/personas.ts). */
  persona: string;
  /** Contribution credit, e.g. "rendered by @user with Sora 2". */
  credit?: string;
  files: ManifestFile[];
}

export interface AvatarManifest {
  version: 1;
  release: string;
  packs: ManifestPack[];
}

const SHA256_RE = /^[0-9a-f]{64}$/;
const NAME_RE = /^[a-z0-9-]+\.(mp4|jpg|jpeg|png)$/;

/** Max bytes per avatar file (docs/AVATARS.md contract). */
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

/** Parse + validate manifest JSON text. Throws with a precise message. */
export function parseManifest(text: string): AvatarManifest {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (cause) {
    throw new Error(
      `avatars.manifest.json is not valid JSON: ${String(cause)}`,
    );
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new Error("manifest must be a JSON object");
  }
  const m = data as Record<string, unknown>;
  if (m.version !== 1) throw new Error("manifest `version` must be 1");
  if (typeof m.release !== "string")
    throw new Error("manifest `release` must be a URL string");
  if (!Array.isArray(m.packs))
    throw new Error("manifest `packs` must be an array");
  for (const pack of m.packs as Record<string, unknown>[]) {
    if (typeof pack.persona !== "string" || pack.persona === "") {
      throw new Error("every pack needs a non-empty `persona`");
    }
    if (pack.credit !== undefined && typeof pack.credit !== "string") {
      throw new Error(
        `pack "${pack.persona}": \`credit\` must be a string when present`,
      );
    }
    if (!Array.isArray(pack.files) || pack.files.length === 0) {
      throw new Error(
        `pack "${pack.persona}": \`files\` must be a non-empty array`,
      );
    }
    for (const f of pack.files as Record<string, unknown>[]) {
      if (typeof f.name !== "string" || !NAME_RE.test(f.name)) {
        throw new Error(
          `pack "${pack.persona}": file name ${JSON.stringify(f.name)} must be kebab-case ` +
            "with a .mp4/.jpg/.jpeg/.png extension",
        );
      }
      if (typeof f.sha256 !== "string" || !SHA256_RE.test(f.sha256)) {
        throw new Error(
          `pack "${pack.persona}" file "${f.name}": \`sha256\` must be 64 hex chars`,
        );
      }
      if (typeof f.url !== "string" || !/^https:\/\//.test(f.url)) {
        throw new Error(
          `pack "${pack.persona}" file "${f.name}": \`url\` must be https`,
        );
      }
    }
  }
  return data as AvatarManifest;
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export interface FileCheckIssue {
  level: "error" | "warning";
  message: string;
}

/** Technical-contract checks on raw file bytes (docs/AVATARS.md). */
export function checkFileBytes(
  name: string,
  bytes: Uint8Array,
): FileCheckIssue[] {
  const issues: FileCheckIssue[] = [];
  if (!/\.(mp4|jpg|jpeg|png)$/.test(name)) {
    issues.push({
      level: "error",
      message:
        "not an allowed avatar file type (contract: .mp4 loops, .jpg/.png poster)",
    });
    return issues;
  }
  if (bytes.byteLength === 0) {
    issues.push({ level: "error", message: "file is empty" });
    return issues;
  }
  if (bytes.byteLength > MAX_FILE_BYTES) {
    issues.push({
      level: "error",
      message: `file is ${(bytes.byteLength / 1024 / 1024).toFixed(1)} MB — the contract caps files at 25 MB`,
    });
  }
  if (/\.mp4$/.test(name)) {
    // MP4 magic: bytes 4..8 spell "ftyp" in the first box header.
    const ftyp = Buffer.from(bytes.slice(4, 8)).toString("ascii");
    if (ftyp !== "ftyp") {
      issues.push({
        level: "error",
        message: "not an MP4 container (missing ftyp header)",
      });
    }
  }
  if (/\.(jpg|jpeg)$/.test(name) && !(bytes[0] === 0xff && bytes[1] === 0xd8)) {
    issues.push({ level: "error", message: "not a JPEG (bad magic bytes)" });
  }
  if (/\.png$/.test(name) && !(bytes[0] === 0x89 && bytes[1] === 0x50)) {
    issues.push({ level: "error", message: "not a PNG (bad magic bytes)" });
  }
  return issues;
}
