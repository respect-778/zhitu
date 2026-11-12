import { describe, expect, it } from "vitest";
import { en } from "../lib/i18n/messages/en";
import { vi } from "../lib/i18n/messages/vi";
import { zh } from "../lib/i18n/messages/zh";
import { DEFAULT_LOCALE, getMessages, resolveLocale, t } from "../lib/i18n";

/** Every string leaf path in `en`, e.g. ["nav.setup", "interview.end", ...]. */
function leafPaths(obj: unknown, prefix = ""): string[] {
  if (typeof obj === "string") return [prefix];
  if (obj && typeof obj === "object") {
    return Object.entries(obj).flatMap(([k, v]) =>
      leafPaths(v, prefix ? `${prefix}.${k}` : k),
    );
  }
  return [];
}

describe("Vietnamese UI pack (issue #50)", () => {
  it("resolves `vi` to the real dictionary, not English", () => {
    expect(getMessages("vi")).toBe(vi);
    expect(getMessages("en")).toBe(en);
    // Spot-check: the pack is actually translated.
    expect(t(getMessages("vi"), "setup.start")).toBe("Bắt đầu phỏng vấn");
    expect(t(getMessages("vi"), "setup.start")).not.toBe(
      t(getMessages("en"), "setup.start"),
    );
  });

  it("covers every `en` key (parity is also enforced by tsc)", () => {
    const missing = leafPaths(en).filter((p) => t(vi, p) === p);
    expect(missing).toEqual([]);
  });

  it("falls back visibly for unknown keys", () => {
    expect(t(getMessages("vi"), "no.such.key")).toBe("no.such.key");
    expect(t(getMessages("en"), "no.such.key")).toBe("no.such.key");
  });
});

describe("Simplified Chinese UI", () => {
  it("uses Chinese by default and preserves supported language preferences", () => {
    expect(DEFAULT_LOCALE).toBe("zh");
    expect(getMessages()).toBe(zh);
    expect(getMessages("zh")).toBe(zh);
    expect(resolveLocale()).toBe("zh");
    expect(resolveLocale("unsupported")).toBe("zh");
    expect(resolveLocale("en")).toBe("en");
    expect(resolveLocale("vi")).toBe("vi");
    expect(t(zh, "setup.start")).toBe("开始模拟面试");
    expect(t(zh, "setup.demoTitle")).toBe("快速体验");
    expect(t(zh, "session.findings")).toBe("面试准备摘要");
  });

  it("covers every English message and preserves interpolation parameters", () => {
    for (const path of leafPaths(en)) {
      const translated = t(zh, path);
      expect(translated).not.toBe(path);
      expect(translated.trim()).not.toBe("");
      const placeholders = (value: string) =>
        [...value.matchAll(/\{\w+\}/g)].map(([name]) => name).sort();
      expect(placeholders(translated)).toEqual(placeholders(t(en, path)));
    }
  });
});
