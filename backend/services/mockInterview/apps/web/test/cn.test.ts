import { describe, expect, it } from "vitest";
import { cn } from "../lib/cn";

describe("cn", () => {
  it("merges plain class names", () => {
    expect(cn("px-2", "py-1")).toBe("px-2 py-1");
  });

  it("dedupes conflicting Tailwind utilities (last wins)", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });

  it("handles conditional and falsy inputs", () => {
    expect(cn("a", false && "b", undefined, null, "c")).toBe("a c");
  });
});
