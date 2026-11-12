import { describe, expect, it } from "vitest";
import {
  MAX_FILE_BYTES,
  checkFileBytes,
  parseManifest,
  sha256Hex,
} from "./avatar-manifest";

const VALID = JSON.stringify({
  version: 1,
  release: "https://github.com/ngoanpv/DeepInterview/releases",
  packs: [
    {
      persona: "recruiter",
      credit: "rendered by @someone with Veo 3.1",
      files: [
        {
          name: "recruiter-idle.mp4",
          sha256: "a".repeat(64),
          url: "https://github.com/ngoanpv/DeepInterview/releases/download/avatars-v1/recruiter-idle.mp4",
        },
      ],
    },
  ],
});

describe("parseManifest", () => {
  it("accepts a valid manifest and an empty pack list", () => {
    expect(parseManifest(VALID).packs[0]?.files[0]?.name).toBe(
      "recruiter-idle.mp4",
    );
    expect(
      parseManifest(
        JSON.stringify({ version: 1, release: "https://x", packs: [] }),
      ).packs,
    ).toEqual([]);
  });

  it("rejects bad hashes, non-https urls, and unknown shapes", () => {
    expect(() =>
      parseManifest(VALID.replace("a".repeat(64), "nothex")),
    ).toThrow(/sha256/);
    expect(() =>
      parseManifest(
        VALID.replace(
          "https://github.com/ngoanpv/DeepInterview/releases/download",
          "http://github.com/ngoanpv/DeepInterview/releases/download",
        ),
      ),
    ).toThrow(/https/);
    expect(() =>
      parseManifest('{"version":2,"release":"x","packs":[]}'),
    ).toThrow(/version/);
    expect(() => parseManifest("[]")).toThrow(/object/);
    expect(() => parseManifest("{not json")).toThrow(/valid JSON/);
  });

  it("rejects non-kebab or wrong-extension filenames", () => {
    expect(() =>
      parseManifest(VALID.replace("recruiter-idle.mp4", "Recruiter Idle.mov")),
    ).toThrow(/kebab-case/);
  });
});

describe("checkFileBytes", () => {
  const mp4 = new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 1, 2, 3]); // "ftyp"
  const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);

  it("passes well-formed mp4 and jpeg bytes", () => {
    expect(checkFileBytes("x-idle.mp4", mp4)).toEqual([]);
    expect(checkFileBytes("x.jpg", jpg)).toEqual([]);
  });

  it("rejects file types outside the contract", () => {
    expect(checkFileBytes("demo.gif", jpg)[0]?.message).toMatch(
      /allowed avatar file type/,
    );
    expect(checkFileBytes("x.mov", mp4)[0]?.message).toMatch(
      /allowed avatar file type/,
    );
  });

  it("rejects wrong magic bytes, empty files, and oversize files", () => {
    expect(checkFileBytes("x-idle.mp4", jpg)[0]?.message).toMatch(/ftyp/);
    expect(checkFileBytes("x.jpg", mp4)[0]?.message).toMatch(/JPEG/);
    expect(checkFileBytes("x.jpg", new Uint8Array(0))[0]?.message).toMatch(
      /empty/,
    );
    const big = new Uint8Array(MAX_FILE_BYTES + 1);
    big[0] = 0xff;
    big[1] = 0xd8;
    expect(checkFileBytes("x.jpg", big)[0]?.message).toMatch(/25 MB/);
  });
});

describe("sha256Hex", () => {
  it("matches a known vector", () => {
    expect(sha256Hex(new Uint8Array(0))).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });
});
