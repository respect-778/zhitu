import { describe, expect, it, vi, beforeEach } from "vitest";
import { isLocalHistoryRequest, SessionHistorySchema } from "@/lib/session-history";

vi.mock("@/lib/supabase/server", () => ({ getUser: vi.fn() }));
import { getUser } from "@/lib/supabase/server";
import { GET } from "@/app/api/sessions/route";

function request(host = "127.0.0.1:5186", headers: Record<string, string> = {}, query = "") {
  return new Request(`http://${host}/api/sessions${query}`, { headers: { host, ...headers } });
}

beforeEach(() => {
  vi.unstubAllGlobals();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
  vi.stubEnv("LOCAL_INTERVIEW_HISTORY", "true");
  vi.stubEnv("INTERVIEW_HISTORY_SECRET", "test-secret");
});

describe("history access", () => {
  it("limits anonymous browsing to an opted-in loopback site", async () => {
    expect(isLocalHistoryRequest(request())).toBe(true);
    expect(isLocalHistoryRequest(request("localhost:3000"))).toBe(true);
    expect(isLocalHistoryRequest(request("example.com"))).toBe(false);
    expect(isLocalHistoryRequest(request("127.0.0.1:3000", { origin: "https://example.com" }))).toBe(false);
    expect(isLocalHistoryRequest(request("127.0.0.1:3000", { "x-forwarded-host": "example.com" }))).toBe(false);
    expect(isLocalHistoryRequest(request("127.0.0.1:3000", { "sec-fetch-site": "cross-site" }))).toBe(false);
    expect((await GET(request("example.com"))).status).toBe(403);
    vi.stubEnv("LOCAL_INTERVIEW_HISTORY", "false");
    expect((await GET(request())).status).toBe(403);
  });

  it("returns validated summaries without caching and keeps the credential server-side", async () => {
    const payload = { items: [], has_more: false };
    const fetch = vi.fn().mockResolvedValue(Response.json(payload));
    vi.stubGlobal("fetch", fetch);
    const response = await GET(request());
    expect(await response.json()).toEqual(payload);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(fetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ headers: { "x-history-secret": "test-secret" } }));
    expect((await GET(request("127.0.0.1:3000", {}, "?offset=bad"))).status).toBe(400);
  });

  it("selects the authenticated owner and rejects unsigned hosted users", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-anon");
    vi.mocked(getUser).mockResolvedValue(null);
    expect((await GET(request("example.com"))).status).toBe(401);
    vi.mocked(getUser).mockResolvedValue({ id: "owner-a" } as Awaited<ReturnType<typeof getUser>>);
    const fetch = vi.fn().mockResolvedValue(Response.json({ items: [], has_more: false }));
    vi.stubGlobal("fetch", fetch);
    expect((await GET(request("example.com", {}, "?user_id=owner-b"))).status).toBe(200);
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("user_id=owner-a"), expect.any(Object));
    expect(fetch).not.toHaveBeenCalledWith(expect.stringContaining("owner-b"), expect.any(Object));
  });

  it("rejects malformed upstream payloads and reports temporary failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ items: [{}], has_more: false })));
    expect((await GET(request())).status).toBe(503);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    expect((await GET(request())).status).toBe(503);
    expect(SessionHistorySchema.safeParse({ items: [], has_more: false }).success).toBe(true);
  });
});
