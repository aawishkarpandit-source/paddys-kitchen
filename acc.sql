-- ════════════════════════════════════════════════════════════════════════════
--  acc.sql — one-shot staff-account attach for Paddy's Kitchen
--
--  Purpose : attach auth user e6df2056-9fd0-4f24-a7ef-89ee3988b206 ("Paddy (Owner)")
--            to the demo tenant "paddys-kitchen" with role = owner.
--  Run     : Supabase Dashboard → SQL Editor → paste the WHOLE file → Run.
--  Order   : run AFTER supabase/schema.sql and (if the tenant row is missing)
--            supabase/seed.sql — this file detects either gap and tells you
--            exactly which file to run instead of failing mysteriously.
--  Safe    : idempotent — re-running never duplicates or downgrades anything.
--
--  NOTE    : the password is NOT in this file (it never lives in SQL). It is
--            whatever you set for the user in Authentication → Users.
-- ════════════════════════════════════════════════════════════════════════════

do $acc$
declare
  -- ── the account being attached (the single place to edit) ────────────────
  v_user_id      constant uuid := 'e6df2056-9fd0-4f24-a7ef-89ee3988b206';
  v_tenant_slug  constant text := 'paddys-kitchen';
  v_role         constant public.staff_role := 'owner';

  v_email        text;
  v_confirmed_at timestamptz;
  v_restaurant_id uuid;
  v_existing_role public.staff_role;
  v_existing_rest uuid;
begin
  -- 1) Backend present? -----------------------------------------------------
  if to_regclass('public.staff_members') is null or to_regclass('public.restaurants') is null then
    raise exception 'Backend tables are missing — run supabase/schema.sql first, then re-run this file.';
  end if;

  -- 2) Tenant present? ------------------------------------------------------
  select r.id into v_restaurant_id from public.restaurants r where r.slug = v_tenant_slug;
  if v_restaurant_id is null then
    raise exception 'Tenant "%" not found — run supabase/seed.sql first, then re-run this file.', v_tenant_slug;
  end if;

  -- 3) Auth user exists? ----------------------------------------------------
  select u.email, u.email_confirmed_at into v_email, v_confirmed_at
    from auth.users u where u.id = v_user_id;
  if v_email is null then
    raise exception 'auth.users has no row for % — create the user in Dashboard → Authentication → Users and copy its exact UUID.', v_user_id;
  end if;

  -- 4) Auth user confirmed? -------------------------------------------------
  if v_confirmed_at is null then
    raise exception 'Auth user (%) exists but the email is NOT confirmed. Easiest fix: delete + recreate the user with "Auto confirm" ON, then re-run this file.', v_email;
  end if;

  -- 5) Attach (only if free to attach) -------------------------------------
  select sm.role, sm.restaurant_id into v_existing_role, v_existing_rest
    from public.staff_members sm where sm.user_id = v_user_id;

  if v_existing_rest is null then
    insert into public.staff_members (user_id, restaurant_id, name, role)
    values (v_user_id, v_restaurant_id, 'Paddy (Owner)', v_role);
    raise notice '✅ Linked % → tenant "%" (role: %).', v_email, v_tenant_slug, v_role;
  elsif v_existing_rest = v_restaurant_id then
    raise notice 'ℹ️  % is already linked to "%" (role: %) — nothing to do.', v_email, v_tenant_slug, v_existing_role;
  else
    raise exception 'Auth user % is already linked to a DIFFERENT restaurant (%). Delete that staff_members row first if this is intentional.', v_email, v_existing_rest;
  end if;

  -- 6) Success banner -------------------------------------------------------
  raise notice '🎉 Setup complete. Sign in at /kds or /admin with: %', v_email;
  raise notice '    Password = whatever you set in Authentication → Users (there is NO default password).';
  raise notice '    If you were already logged in: sign out once so the app re-reads your role.';
end
$acc$;

-- ════════════════════════════════════════════════════════════════════════════
--  Human-readable verification (only reached when the DO block above passes)
-- ════════════════════════════════════════════════════════════════════════════
select
  sm.user_id                                                    as "user_id",
  u.email                                                       as "email",
  u.email_confirmed_at is not null                              as "confirmed",
  sm.name                                                       as "name",
  sm.role::text                                                 as "role",
  r.slug                                                        as "restaurant",
  (select count(*) from public.tables t  where t.restaurant_id = r.id)  as "tables",
  (select count(*) from public.menu_items mi where mi.restaurant_id = r.id) as "menu_items"
from public.staff_members sm
join public.restaurants r on r.id = sm.restaurant_id
left join auth.users u   on u.id = sm.user_id
where sm.user_id = 'e6df2056-9fd0-4f24-a7ef-89ee3988b206';
