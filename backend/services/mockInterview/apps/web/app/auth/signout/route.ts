import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { appPath } from "@/lib/app-path";
import { publicEnv } from "@/lib/env";

/**
 * Sign the user out, then redirect home. No-op on the auth side when Supabase
 * is unconfigured (dev mode) — still redirects so the button always works.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  if (supabase) {
    await supabase.auth.signOut();
  }
  const returnOrigin = process.env.NEXT_PUBLIC_INTERVIEW_BASE_PATH
    ? publicEnv.appUrl
    : request.url;
  return NextResponse.redirect(new URL(appPath("/"), returnOrigin), {
    status: 303,
  });
}
