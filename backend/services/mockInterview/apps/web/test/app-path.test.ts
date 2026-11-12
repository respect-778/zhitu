import { afterEach, describe, expect, it, vi } from "vitest";
import { appPath } from "../lib/app-path";
import { fetchSessionView, resetSessionPolling } from "../lib/session";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("website and standalone app paths", () => {
  it.each([undefined, "/mock-interview"])(
    "polls the same session under %s",
    async (prefix) => {
      vi.stubEnv("NEXT_PUBLIC_INTERVIEW_BASE_PATH", prefix);
      const fetchMock = vi.fn(async () =>
        Response.json({
          session_id: "test_session",
          status: "ready",
          progress: [],
          prep_warnings: [],
          context: null,
        }),
      );
      vi.stubGlobal("fetch", fetchMock);
      resetSessionPolling("test_session");
      const view = await fetchSessionView("test_session");
      expect(view.session_id).toBe("test_session");
      expect(view.status).toBe("ready");
      expect(fetchMock).toHaveBeenCalledWith(
        `${prefix || ""}/api/session/test_session`,
        { cache: "no-store" },
      );
    },
  );

  it("keeps auth return paths and queries under the website mount", () => {
    vi.stubEnv("NEXT_PUBLIC_INTERVIEW_BASE_PATH", "/mock-interview");
    expect(appPath("/auth/callback?code=test")).toBe(
      "/mock-interview/auth/callback?code=test",
    );
  });
});
