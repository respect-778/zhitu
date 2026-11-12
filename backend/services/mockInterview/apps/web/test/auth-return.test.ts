import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => null }));

import { GET } from "../app/auth/callback/route";
import { POST } from "../app/auth/signout/route";

afterEach(() => vi.unstubAllEnvs());

describe("authentication return URLs behind the website proxy", () => {
  it.each([
    ["", "http://localhost:3000", "http://localhost:3000"],
    ["/mock-interview", "http://localhost:3001", "http://127.0.0.1:5186"],
  ])(
    "returns to the configured origin for mount %s",
    async (prefix, internal, expected) => {
      vi.stubEnv("NEXT_PUBLIC_INTERVIEW_BASE_PATH", prefix);
      vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://127.0.0.1:5186");
      const callback = await GET(
        new NextRequest(`${internal}${prefix}/auth/callback`),
      );
      expect(callback.headers.get("location")).toBe(
        `${expected}${prefix}/setup`,
      );
      const signout = await POST(
        new NextRequest(`${internal}${prefix}/auth/signout`, {
          method: "POST",
        }),
      );
      expect(signout.status).toBe(303);
      expect(signout.headers.get("location")).toBe(`${expected}${prefix}/`);
    },
  );
});
