-- ════════════════════════════════════════════════════════════════════════════
--  Paddy's Kitchen — Multi-tenant restaurant ordering (Supabase Free Tier)
--  Run top-to-bottom in: Supabase Dashboard → SQL Editor → New query
--  Idempotent: safe to re-run. One file = full backend.
--
--  Free-tier design notes:
--   • No media in the DB — images are external URLs (Unsplash etc.).
--   • Realtime publication limited to 3 hot tables (orders, order_items, staff_calls)
--     so WAL/audit payload stays small and other tables never stream.
--   • cleanup_old_orders() + pg_cron caps row growth; whole DB stays « a few MB.
--   • All customer writes go through security-definer RPCs/place_order so prices
--     are computed server-side (clients can never send their own totals).
-- ════════════════════════════════════════════════════════════════════════════

begin;

-- ─────────────────────────────────────────────
-- 1. ENUMS
-- ─────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_type where typname = 'table_status') then
    create type public.table_status as enum ('active', 'inactive');
  end if;
  if not exists (select 1 from pg_type where typname = 'order_status') then
    create type public.order_status as enum ('pending', 'preparing', 'ready', 'completed', 'cancelled');
  end if;
  if not exists (select 1 from pg_type where typname = 'call_status') then
    create type public.call_status as enum ('pending', 'resolved');
  end if;
  if not exists (select 1 from pg_type where typname = 'call_type') then
    create type public.call_type as enum ('assistance', 'bill');
  end if;
  if not exists (select 1 from pg_type where typname = 'staff_role') then
    create type public.staff_role as enum ('owner', 'admin', 'staff');
  end if;
end $$;

-- ─────────────────────────────────────────────
-- 2. TABLES
-- ─────────────────────────────────────────────
create table if not exists public.restaurants (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique check (slug ~ '^[a-z0-9-]+$'),
  logo_url    text,
  settings    jsonb not null default '{}'::jsonb,   -- wifi, theme, currency, hours…
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists public.tables (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  table_number  text not null,
  qr_code_url   text,                                -- optional; the app also renders QR client-side (zero storage)
  status        public.table_status not null default 'active',
  created_at    timestamptz not null default now(),
  unique (restaurant_id, table_number)
);

create table if not exists public.categories (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name          text not null,
  display_order int not null default 0,
  created_at    timestamptz not null default now(),
  unique (restaurant_id, name)
);

create table if not exists public.menu_items (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  category_id   uuid not null references public.categories(id) on delete cascade,
  name          text not null,
  description   text,
  price         numeric(10,2) not null check (price >= 0),
  image_url     text,                                -- external URLs (Unsplash) → keeps Storage « 1 GB
  is_available  boolean not null default true,       -- "86" switch
  dietary_tags  text[] not null default '{}',        -- e.g. {vegetarian,gluten-free}
  display_order int not null default 0,
  created_at    timestamptz not null default now()
);

create table if not exists public.item_modifiers (
  id               uuid primary key default gen_random_uuid(),
  menu_item_id     uuid not null references public.menu_items(id) on delete cascade,
  group_name       text not null,                    -- e.g. "Cooking level"
  option_name      text not null,                    -- e.g. "Medium rare"
  additional_price numeric(8,2) not null default 0 check (additional_price >= 0),
  is_required      boolean not null default false,
  display_order    int not null default 0,
  created_at       timestamptz not null default now()
);

create table if not exists public.orders (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references public.restaurants(id) on delete cascade,
  table_id       uuid references public.tables(id) on delete set null,
  status         public.order_status not null default 'pending',
  total_amount   numeric(10,2) not null default 0,
  customer_notes text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists public.staff_calls (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  table_id      uuid references public.tables(id) on delete cascade,
  call_type     public.call_type not null default 'assistance',
  status        public.call_status not null default 'pending',
  created_at    timestamptz not null default now(),
  resolved_at   timestamptz
);

-- Staff/owners link Supabase Auth users to a tenant. Create the auth user via
-- Dashboard → Authentication → Add user, then insert the row here (or via seed).
create table if not exists public.staff_members (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null unique references auth.users(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name          text not null default '',
  role          public.staff_role not null default 'staff',
  created_at    timestamptz not null default now()
);

-- order_items denormalizes restaurant_id + item_name/unit_price snapshots so
-- historical tickets stay correct after menu edits, and realtime can filter by
-- restaurant with a single-column filter.
create table if not exists public.order_items (
  id                 uuid primary key default gen_random_uuid(),
  order_id           uuid not null references public.orders(id) on delete cascade,
  restaurant_id      uuid not null references public.restaurants(id) on delete cascade,
  menu_item_id       uuid references public.menu_items(id) on delete set null,
  item_name          text not null default '',       -- snapshot at time of ordering
  quantity           int  not null check (quantity >= 1),
  selected_modifiers jsonb not null default '[]'::jsonb, -- [{group_name, option_name, additional_price}]
  unit_price         numeric(10,2) not null default 0,   -- base price + modifiers (per unit)
  item_total         numeric(10,2) not null default 0,   -- unit_price * quantity
  created_at         timestamptz not null default now()
);

-- ─────────────────────────────────────────────
-- 3. INDEXES (small, all purpose-built for hot paths)
-- ─────────────────────────────────────────────
create index if not exists idx_orders_rest_created   on public.orders (restaurant_id, created_at desc);
create index if not exists idx_orders_table_created  on public.orders (table_id, created_at desc);
create index if not exists idx_orders_status         on public.orders (restaurant_id, status);
create index if not exists idx_order_items_order     on public.order_items (order_id);
create index if not exists idx_order_items_rest      on public.order_items (restaurant_id);
create index if not exists idx_staff_calls_rest      on public.staff_calls (restaurant_id, status, created_at desc);
create index if not exists idx_tables_rest           on public.tables (restaurant_id);
create index if not exists idx_categories_rest       on public.categories (restaurant_id, display_order);
create index if not exists idx_menu_items_rest       on public.menu_items (restaurant_id, category_id);
create index if not exists idx_menu_items_available  on public.menu_items (restaurant_id) where is_available;
create index if not exists idx_item_modifiers_item   on public.item_modifiers (menu_item_id);
create index if not exists idx_staff_members_user    on public.staff_members (user_id);

-- ─────────────────────────────────────────────
-- 4. HELPER FUNCTIONS (security definer → no RLS recursion)
--    Used inside policies; returns only a bool/enum, never row data.
-- ─────────────────────────────────────────────
create or replace function public.my_staff_role(p_restaurant_id uuid)
returns public.staff_role
language sql stable security definer
set search_path = public
as $$
  select sm.role
  from public.staff_members sm
  where sm.user_id = auth.uid()
    and sm.restaurant_id = p_restaurant_id
  limit 1;
$$;

-- Auto-manage updated_at on staff_calls only (orders has its own guard trigger).
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_staff_calls_updated on public.staff_calls;
create trigger trg_staff_calls_updated
  before update on public.staff_calls
  for each row execute function public.set_updated_at();

-- Immutability + valid state machine for orders (kitchens push buttons fast).
create or replace function public.guard_order_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allowed text[];
begin
  if new.restaurant_id is distinct from old.restaurant_id
     or new.table_id is distinct from old.table_id then
    raise exception 'orders.restaurant_id / table_id are immutable';
  end if;
  if new.total_amount is distinct from old.total_amount then
    raise exception 'orders.total_amount is immutable (computed server-side by place_order)';
  end if;
  if new.status is distinct from old.status then
    v_allowed := case old.status::text
      when 'pending'   then array['preparing', 'ready', 'cancelled']
      when 'preparing' then array['ready', 'cancelled']
      when 'ready'     then array['completed', 'cancelled']
      else array[]::text[]            -- completed/cancelled are terminal
    end;
    if not (new.status::text = any(v_allowed)) then
      raise exception 'Invalid status transition % → %', old.status, new.status;
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_guard_orders_update on public.orders;
create trigger trg_guard_orders_update
  before update on public.orders
  for each row execute function public.guard_order_update();

-- ─────────────────────────────────────────────
-- 5. ATOMIC ORDER PLACEMENT (the only way customers write orders)
--    Client sends item ids + quantity + modifier ids. Prices are re-read from
--    the DB, required modifier groups are enforced, and totals are computed
--    here. Never trust client math.
-- ─────────────────────────────────────────────
create or replace function public.place_order(
  p_restaurant_id  uuid,
  p_table_id       uuid,
  p_customer_notes text default null,
  p_items          jsonb default '[]'::jsonb
  -- p_items: [{ "menu_item_id": "uuid", "quantity": 2, "selected_modifier_ids": ["uuid", …] }]
)
returns jsonb                                  -- { "order": {…full row…} }
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id      uuid;
  v_order         jsonb;
  v_total         numeric(10,2) := 0;
  v_staged        jsonb := '[]'::jsonb;
  v_row           record;
  v_item          record;
  v_mod           record;
  v_mod_ids       text[];
  v_mod_id        text;
  v_mods          jsonb;
  v_mod_sum       numeric(10,2);
  v_unit          numeric(10,2);
  v_line_total    numeric(10,2);
  v_missing_group text;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Cart is empty';
  end if;

  -- 1. Table must belong to an active restaurant and be seatable.
  if not exists (
    select 1
    from public.tables t
    join public.restaurants r on r.id = t.restaurant_id
    where t.id = p_table_id
      and t.restaurant_id = p_restaurant_id
      and t.status = 'active'
      and r.is_active
  ) then
    raise exception 'Table not found or unavailable for this restaurant';
  end if;

  -- 2. Stage validated lines.
  for v_row in
    select * from jsonb_to_recordset(p_items) as x(menu_item_id uuid, quantity int, selected_modifier_ids text[])
  loop
    if v_row.quantity is null or v_row.quantity < 1 or v_row.quantity > 50 then
      raise exception 'Invalid quantity for an item in your cart';
    end if;

    select i.price, i.name, i.is_available
      into v_item
      from public.menu_items i
     where i.id = v_row.menu_item_id
       and i.restaurant_id = p_restaurant_id;

    if not found then
      raise exception 'A menu item in your cart no longer exists';
    end if;
    if not v_item.is_available then
      raise exception '"%" was just sold out — please reorder', v_item.name;
    end if;

    -- Resolve selected modifiers against the DB (prices come from the DB only).
    v_mod_ids := coalesce(v_row.selected_modifier_ids, '{}');
    v_mods    := '[]'::jsonb;
    foreach v_mod_id in array v_mod_ids loop
      select mm.group_name, mm.option_name, mm.additional_price
        into v_mod
        from public.item_modifiers mm
       where mm.id = v_mod_id::uuid
         and mm.menu_item_id = v_row.menu_item_id;
      if not found then
        raise exception 'Invalid option chosen for "%"', v_item.name;
      end if;
      v_mods := v_mods || jsonb_build_object(
        'group_name',       v_mod.group_name,
        'option_name',      v_mod.option_name,
        'additional_price', v_mod.additional_price
      );
    end loop;

    -- Enforce required modifier groups ("cooking level" etc.).
    select m.group_name into v_missing_group
      from public.item_modifiers m
     where m.menu_item_id = v_row.menu_item_id
       and m.is_required
       and not exists (
         select 1 from jsonb_array_elements(v_mods) s(value)
          where s.value->>'group_name' = m.group_name
       )
     limit 1;
    if v_missing_group is not null then
      raise exception 'Please choose an option for "%"', v_missing_group;
    end if;

    v_mod_sum := coalesce((
      select sum((s.value->>'additional_price')::numeric)
        from jsonb_array_elements(v_mods) s(value)
    ), 0);

    v_unit       := coalesce(v_item.price, 0) + v_mod_sum;
    v_line_total := v_unit * v_row.quantity;
    v_total      := v_total + v_line_total;

    v_staged := v_staged || jsonb_build_object(
      'menu_item_id',      v_row.menu_item_id,
      'item_name',         v_item.name,
      'quantity',          v_row.quantity,
      'unit_price',        v_unit,
      'selected_modifiers',v_mods,
      'item_total',        v_line_total
    );
  end loop;

  if v_total >= 10000.00 then
    raise exception 'Order total exceeds the demo limit';
  end if;

  -- 3. Write order + items atomically.
  insert into public.orders (restaurant_id, table_id, customer_notes, total_amount)
  values (p_restaurant_id, p_table_id, left(coalesce(p_customer_notes, ''), 500), v_total)
  returning id into v_order_id;

  insert into public.order_items
        (order_id, restaurant_id, menu_item_id, item_name, quantity, unit_price, selected_modifiers, item_total)
  select v_order_id, p_restaurant_id,
         (s.value->>'menu_item_id')::uuid,
         s.value->>'item_name',
         (s.value->>'quantity')::int,
         (s.value->>'unit_price')::numeric(10,2),
         s.value->'selected_modifiers',
         (s.value->>'item_total')::numeric(10,2)
    from jsonb_array_elements(v_staged) s(value);

  select to_jsonb(o.*) into v_order from public.orders o where o.id = v_order_id;
  return jsonb_build_object('order', v_order);
end $$;

-- ─────────────────────────────────────────────
-- 6. ROW LEVEL SECURITY
-- ─────────────────────────────────────────────
alter table public.restaurants    enable row level security;
alter table public.tables         enable row level security;
alter table public.categories     enable row level security;
alter table public.menu_items     enable row level security;
alter table public.item_modifiers enable row level security;
alter table public.orders         enable row level security;
alter table public.order_items    enable row level security;
alter table public.staff_calls    enable row level security;
alter table public.staff_members  enable row level security;

-- restaurants ---------------------------------------------------------------
drop policy if exists restaurants_select on public.restaurants;
create policy restaurants_select on public.restaurants
  for select to anon, authenticated
  using (is_active or public.my_staff_role(id) is not null);

drop policy if exists restaurants_update on public.restaurants;
create policy restaurants_update on public.restaurants
  for update to authenticated
  using (public.my_staff_role(id) in ('owner', 'admin'))
  with check (public.my_staff_role(id) in ('owner', 'admin'));
-- insert/delete: service_role only (tenant onboarding is an ops task).

-- tables --------------------------------------------------------------------
drop policy if exists tables_select on public.tables;
create policy tables_select on public.tables
  for select to anon, authenticated
  using (
    exists (select 1 from public.restaurants r where r.id = restaurant_id and r.is_active)
    or public.my_staff_role(restaurant_id) is not null
  );

drop policy if exists tables_manage on public.tables;
create policy tables_manage on public.tables
  for all to authenticated
  using (public.my_staff_role(restaurant_id) in ('owner', 'admin'))
  with check (public.my_staff_role(restaurant_id) in ('owner', 'admin'));

-- categories -----------------------------------------------------------------
drop policy if exists categories_select on public.categories;
create policy categories_select on public.categories
  for select to anon, authenticated
  using (
    exists (select 1 from public.restaurants r where r.id = restaurant_id and r.is_active)
    or public.my_staff_role(restaurant_id) is not null
  );

drop policy if exists categories_manage on public.categories;
create policy categories_manage on public.categories
  for all to authenticated
  using (public.my_staff_role(restaurant_id) in ('owner', 'admin'))
  with check (public.my_staff_role(restaurant_id) in ('owner', 'admin'));

-- menu_items -----------------------------------------------------------------
drop policy if exists menu_items_select on public.menu_items;
create policy menu_items_select on public.menu_items
  for select to anon, authenticated
  using (
    public.my_staff_role(restaurant_id) is not null
    or (
      is_available
      and exists (select 1 from public.restaurants r where r.id = restaurant_id and r.is_active)
    )
  );

drop policy if exists menu_items_manage on public.menu_items;
create policy menu_items_manage on public.menu_items
  for all to authenticated
  using (public.my_staff_role(restaurant_id) in ('owner', 'admin'))
  with check (public.my_staff_role(restaurant_id) in ('owner', 'admin'));

-- item_modifiers -------------------------------------------------------------
drop policy if exists item_modifiers_select on public.item_modifiers;
create policy item_modifiers_select on public.item_modifiers
  for select to anon, authenticated
  using (
    exists (
      select 1
      from public.menu_items mi
      join public.restaurants r on r.id = mi.restaurant_id
      where mi.id = menu_item_id and mi.is_available and r.is_active
    )
    or exists (
      select 1 from public.menu_items mi2
      where mi2.id = menu_item_id and public.my_staff_role(mi2.restaurant_id) is not null
    )
  );

drop policy if exists item_modifiers_manage on public.item_modifiers;
create policy item_modifiers_manage on public.item_modifiers
  for all to authenticated
  using (
    exists (
      select 1 from public.menu_items mi
      where mi.id = menu_item_id and public.my_staff_role(mi.restaurant_id) in ('owner', 'admin')
    )
  )
  with check (
    exists (
      select 1 from public.menu_items mi
      where mi.id = menu_item_id and public.my_staff_role(mi.restaurant_id) in ('owner', 'admin')
    )
  );

-- orders ---------------------------------------------------------------------
-- Customers (anon) can read only the last 24h of orders for their table's view;
-- staff read everything for their tenant. Writes happen exclusively through
-- place_order() — there is deliberately NO anon INSERT policy on orders.
drop policy if exists orders_select on public.orders;
create policy orders_select on public.orders
  for select to anon, authenticated
  using (
    created_at > now() - interval '24 hours'
    or public.my_staff_role(restaurant_id) is not null
  );

drop policy if exists orders_staff_update on public.orders;
create policy orders_staff_update on public.orders
  for update to authenticated
  using (public.my_staff_role(restaurant_id) is not null)
  with check (public.my_staff_role(restaurant_id) is not null);

-- order_items ----------------------------------------------------------------
drop policy if exists order_items_select on public.order_items;
create policy order_items_select on public.order_items
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_id and o.created_at > now() - interval '24 hours'
    )
    or public.my_staff_role(restaurant_id) is not null
  );

-- staff_calls ----------------------------------------------------------------
drop policy if exists staff_calls_select on public.staff_calls;
create policy staff_calls_select on public.staff_calls
  for select to anon, authenticated
  using (
    created_at > now() - interval '24 hours'
    or public.my_staff_role(restaurant_id) is not null
  );

drop policy if exists staff_calls_anon_insert on public.staff_calls;
create policy staff_calls_anon_insert on public.staff_calls
  for insert to anon, authenticated
  with check (
    exists (
      select 1
      from public.tables t
      join public.restaurants r on r.id = t.restaurant_id
      where t.id = staff_calls.table_id
        and t.restaurant_id = staff_calls.restaurant_id
        and t.status = 'active'
        and r.is_active
    )
  );

drop policy if exists staff_calls_staff_update on public.staff_calls;
create policy staff_calls_staff_update on public.staff_calls
  for update to authenticated
  using (public.my_staff_role(restaurant_id) is not null)
  with check (public.my_staff_role(restaurant_id) is not null);

-- staff_members --------------------------------------------------------------
drop policy if exists staff_members_read_own on public.staff_members;
create policy staff_members_read_own on public.staff_members
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists staff_members_owner_manage on public.staff_members;
create policy staff_members_owner_manage on public.staff_members
  for all to authenticated
  using (public.my_staff_role(restaurant_id) in ('owner', 'admin'))
  with check (public.my_staff_role(restaurant_id) in ('owner', 'admin'));

-- ─────────────────────────────────────────────
-- 7. TABLE-LEVEL GRANTS (hardened)
--    RLS above decides *which rows*; grants decide *which tables/commands*.
-- ─────────────────────────────────────────────
revoke all on all tables in schema public from anon, authenticated;

grant select on public.restaurants, public.tables to anon, authenticated;
grant select on public.categories, public.menu_items, public.item_modifiers to anon, authenticated;
grant select, insert on public.staff_calls to anon, authenticated;      -- customers may call staff
grant select on public.orders, public.order_items to anon, authenticated;

grant select, insert, update, delete on public.restaurants, public.tables,
      public.categories, public.menu_items, public.item_modifiers to authenticated;
grant select, update on public.orders, public.staff_calls to authenticated;  -- staff KDS actions
grant select on public.staff_members to authenticated;
grant select, insert, update, delete on public.staff_members to authenticated; -- owners manage team

grant execute on function public.my_staff_role(uuid) to anon, authenticated;
grant execute on function public.place_order(uuid, uuid, text, jsonb) to anon, authenticated;

commit;

-- ─────────────────────────────────────────────
-- 8. REALTIME (keep it minimal — the 200-connection limit is the budget)
--    Only the 3 hot tables stream. Full replica identity so UPDATE/DELETE
--    payloads carry the old row (needed for cheap client-side merging).
-- ─────────────────────────────────────────────
do $rt$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'orders') then
    execute 'alter publication supabase_realtime add table public.orders';
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'order_items') then
    execute 'alter publication supabase_realtime add table public.order_items';
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'staff_calls') then
    execute 'alter publication supabase_realtime add table public.staff_calls';
  end if;
end
$rt$;

alter table public.orders      replica identity full;
alter table public.order_items replica identity full;
alter table public.staff_calls replica identity full;

-- ─────────────────────────────────────────────
-- 9. AUTO-CLEANUP — keeps row growth » 500 MB forever.
--    Completed/cancelled orders and staff calls older than 48h are purged;
--    order_items disappear via ON DELETE CASCADE. A 14-day sweep catches
--    abandoned pending orders too.
--    Run manually:  select public.cleanup_old_orders();
-- ─────────────────────────────────────────────
create or replace function public.cleanup_old_orders()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.orders      -- cascades into order_items
   where status in ('completed', 'cancelled')
     and created_at < now() - interval '48 hours';

  -- Safety net: abandoned/pending orders never linger (also purges 48h+ completed rows if cron missed a run)
  delete from public.orders
   where created_at < now() - interval '14 days';

  delete from public.staff_calls
   where created_at < now() - interval '48 hours';

  -- Free-tier courtesy: reclaim dead tuples without autovacuum waiting around
  vacuum analyze public.orders;
  vacuum analyze public.order_items;
  vacuum analyze public.staff_calls;
end $$;

-- Only the service role / cron may run destructive cleanup.
revoke all on function public.cleanup_old_orders() from public;
revoke all on function public.cleanup_old_orders() from anon, authenticated;
grant execute on function public.cleanup_old_orders() to service_role;

-- Schedule nightly at 03:30 UTC. Enable "pg_cron" first:
--   Dashboard → Database → Extensions → pg_cron → Enable
do $cron$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('paddys-nightly-cleanup');
    perform cron.schedule(
      'paddys-nightly-cleanup',
      '30 3 * * *',
      $job$ select public.cleanup_old_orders() $job$
    );
    raise notice 'pg_cron job "paddys-nightly-cleanup" scheduled for 03:30 UTC daily.';
  else
    raise notice 'pg_cron is not enabled yet — enable it in Database → Extensions, then re-run this file. The GitHub Action keepalive below also calls cleanup_old_orders() as a safety net.';
  end if;
end
$cron$;
