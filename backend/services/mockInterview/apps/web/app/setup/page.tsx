import Link from "next/link";
import { cookies } from "next/headers";
import { appPath } from "@/lib/app-path";
import { getMessages, resolveLocale, t } from "@/lib/i18n";
import { isR2Configured, isSupabaseConfigured } from "@/lib/env";
import { getUser } from "@/lib/supabase/server";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Button } from "@/components/ui/button";
import { LanguageToggle } from "@/components/language-toggle";
import { SetupForm } from "@/components/setup/setup-form";
import styles from "@/components/setup/setup-wizard.module.css";

// Evaluate at request time: `isR2Configured()` reads server env, which must not
// be baked into a static prerender (a deploy with R2 set would otherwise serve a
// stale `r2Configured=false` and never light the upload path).
export const dynamic = "force-dynamic";

/**
 * Setup is a server component so it can read server-only config
 * (`isR2Configured()` is invisible to the browser) and resolve the current
 * user, then hand both into the client form island as props.
 */
export default async function SetupPage() {
  const messages = getMessages(
    resolveLocale((await cookies()).get("locale")?.value),
  );
  // R2 status must be computed server-side — the client can't see server env.
  const r2Configured = isR2Configured();

  // Soft auth signal: surfaces a sign-out affordance when signed in. Page-level
  // gating lives on /interview; setup itself stays reachable in dev mode.
  const user = isSupabaseConfigured() ? await getUser() : null;

  return (
    <main
      className={`${styles.page} ${process.env.NEXT_PUBLIC_INTERVIEW_BASE_PATH ? styles.embedded : ""}`}
    >
      <header className={styles.pageHeader}>
        <Link href="/" className="no-underline">
          <Eyebrow>DeepInterview</Eyebrow>
        </Link>
        <div className="flex items-center gap-3">
          <LanguageToggle />
          {user && (
            <form action={appPath("/auth/signout")} method="post">
              <Button type="submit" variant="ghost" size="sm">
                {t(messages, "common.signOut")}
              </Button>
            </form>
          )}
        </div>
      </header>

      <SetupForm r2Configured={r2Configured} />
    </main>
  );
}
