-- 0005_profiles_hardening.sql — lock down the profiles row + hygiene.
--
-- Before this migration the `profiles` "own profile" policy was `for all`, so a
-- signed-in user could PATCH their own row through the PostgREST anon endpoint
-- with their JWT. End users never need to write their profile (the row is
-- created by the security-definer signup trigger; there is no self-service
-- profile edit in OSS), so make it read-only. Also indexes the hot sessions
-- query path and pins search_path on the pre-existing definer/trigger functions.

-- ── profiles: read-only to end users ──────────────────────────────────────
-- Replace the permissive `for all` policy with SELECT-only. Belt-and-suspenders:
-- revoke the default PostgREST write grants so a future permissive policy can't
-- silently re-open write access.
drop policy if exists "own profile" on public.profiles;

drop policy if exists "own profile read" on public.profiles;
create policy "own profile read" on public.profiles
  for select using (auth.uid() = id);

revoke insert, update, delete on public.profiles from anon, authenticated;

-- ── sessions: index the hot RLS/query path ────────────────────────────────
-- Every "list my sessions" read and the `using (auth.uid() = user_id)` RLS check
-- filter on user_id; without an index they seq-scan.
create index if not exists sessions_user_id_idx
  on public.sessions (user_id, created_at desc);

-- ── search_path pins on pre-existing definer/trigger functions ────────────
-- handle_new_user runs SECURITY DEFINER on every signup with a mutable
-- search_path (the standard Supabase linter finding). Pin it. touch_updated_at
-- is not definer but pin it too for consistency.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
    values (new.id, new.email)
  on conflict do nothing;
  return new;
end;
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
