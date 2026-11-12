import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { appPath } from "@/lib/app-path";
import { publicEnv } from "@/lib/env";

/**
 * OAuth / email-confirmation callback. Exchanges the `?code` for a session,
 * then redirects to /setup. When Supabase is unconfigured (`createClient()`
 * returns null) we simply pass through to /setup so dev mode never 500s.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  const supabase = await createClient();
  if (supabase && code) {
    await supabase.auth.exchangeCodeForSession(code);
  }

  const returnOrigin = process.env.NEXT_PUBLIC_INTERVIEW_BASE_PATH
    ? publicEnv.appUrl
    : origin;
  return NextResponse.redirect(new URL(appPath("/setup"), returnOrigin));
}
