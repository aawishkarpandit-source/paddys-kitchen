# Paddy's Kitchen 🍀

A multi-tenant restaurant ordering + kitchen display system, engineered to run
**indefinitely on Supabase's Free Tier**. Guest flow is mobile-first/PWA-ready
(scan-to-order), staff get a realtime KDS, admins get an 86-board, QR
generator and client-side analytics.

**Stack:** React 19 · TypeScript · Vite · Tailwind CSS v4 · React Router 7 ·
Supabase (Postgres + RLS + Realtime + pg_cron) · Vercel (static, zero functions)

---

## 1) What's in the box

```
Paddys-Kitchen/
├── supabase/
│   ├── schema.sql        # ENTIRE backend: tables, RLS, RPCs, triggers, realtime, cleanup + cron
│   └── seed.sql          # Demo tenant: menu, modifiers, 6 tables, WiFi settings
├── .github/workflows/keepalive.yml   # Daily REST ping → prevents inactivity pause
├── src/
│   ├── types/database.ts # TS interfaces for every table (+ GenericsSchema for supabase-js)
│   ├── types/models.ts   # View types (numeric→number, joined shapes)
│   ├── lib/              # supabase client, api surface, mapping, analytics, chime, utils
│   ├── hooks/
│   │   ├── useRealtimeOrders.ts  # ★ subscriptions + strict removeChannel cleanup + healing
│   │   ├── useStaffCalls.ts      # realtime "call staff" stream (same guarantees)
│   │   ├── useRestaurantMenu.ts  # one round-trip menu tree (categories→items→modifiers)
│   │   └── useStaffAuth.ts       # auth + tenant/role resolution
│   ├── context/SessionContext.tsx # QR session (?r=slug&table=n → localStorage fallback)
│   ├── components/       # customer/ · kds/ · admin/ · ui/ (+ StaffLogin, LiveBadge)
│   └── pages/            # Landing, Menu (PWA), KDS, Admin
└── vercel.json           # SPA rewrites
```

## 2) Setup (15 minutes)

**a) Supabase project** → create a free one. Then SQL Editor:

1. Run `supabase/schema.sql` (single file, idempotent).
2. Run `supabase/seed.sql` (demo tenant).
3. Staff account: **Authentication → Add user** (e.g. `chef@paddys.demo`), copy its UUID, then run the commented block at the bottom of `seed.sql` with that UUID.
4. Enable **Database → Extensions → pg_cron** (the schema schedules `paddys-nightly-cleanup` at the end automatically).

**b) App** → copy `.env.example` → `.env`, fill:

```bash
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

```bash
npm install
npm run dev            # http://localhost:5173
```

**c) Prod** → push to GitHub, import into Vercel, add the two env vars.
`vercel.json` already handles SPA routing. `npm run build` → static, no functions.

## 3) Free-tier contract

| Constraint | Design response | Where |
|---|---|---|
| **DB < 500 MB** | Finished orders + calls deleted after 48h (`order_items` cascade), 14-day sweep for abandoned rows, nightly `vacuum analyze`. Even at ~1.5 KB/order you'd stay under 400 MB at implausible volume. | `schema.sql §9` + `pg_cron` |
| **Media < 1 GB** | Zero Supabase Storage usage: menu images are external URLs (Unsplash), QR codes rendered client-side, chime is synthesized WebAudio (no MP3s). | `MenuItemCard`, `TableManager`, `lib/chime.ts` |
| **≤ 200 realtime conns** | ONE websocket per tab (postgres_changes multiplex over a single channel family). One channel per stream, `removeChannel()` on every unmount with `cancelled` guards (StrictMode + HMR safe). `eventsPerSecond: 3` throttle. DEBUG audit: `(window as any).__pkChannelAudit()` | `useRealtimeOrders`, `useStaffCalls`, `lib/supabase.ts` |
| **Realtime WAL/payload size** | Realtime publication contains **only** `orders`, `order_items`, `staff_calls`. Menu/catalog updates never stream (guest menus refetch on demand). | `schema.sql §8` |
| **Inactivity pause (7d)** | Daily REST ping via GitHub Action (1 row, anon key) + safety-net `cleanup_old_orders()` call. Add repo secrets `SUPABASE_URL`, `SUPABASE_ANON_KEY` (optional `SUPABASE_SERVICE_ROLE_KEY`). | `.github/workflows/keepalive.yml` |
| **Cheap reads** | Menu = one FK-embedded query; status page served by the same subscription as ordering; analytics = one bounded snapshot (300 rows), aggregated in-memory — no SQL views/RPC cron watchers. | `useRestaurantMenu`, `lib/analytics.ts` |

## 4) Security model (why it's hard to price your own burger)

- Customers are anonymous. **No direct insert policy on `orders`** — all
  ordering flows through the `place_order(uuid, uuid, text, jsonb)`
  SECURITY DEFINER RPC that re-reads price + modifier prices from the DB,
  enforces required modifier groups, caps quantity/total, and writes order +
  items in **one transaction**. Clients can't incorrupt totals.
- RLS partitions by tenant: staff (`staff_members`) only ever reach their own
  restaurant's rows; anonymous reads are capped to the **last 24h** of orders
  and calls (enough for a table session; nothing historical leaks).
- Order state machine enforced by a DB trigger (`pending→preparing→ready→completed`,
  voidable only before done; `total_amount` immutable).
- Admin/menu writes require `owner`|`admin` role; KDS actions require any staff role.

## 5) Realtime rules for contributors

1. Never create raw `supabase.channel()` outside a hook that cleans up in its
   `useEffect` return (`removeChannel` — not just `unsubscribe`).
2. Filter by single column: `restaurant_id=eq.<uuid>` (multi-column realtime
   filters are not supported; narrow further client-side).
3. The three subscribed tables are `REPLICA IDENTITY FULL` — DELETE/UPDATE
   payloads carry the full old row, which drives cheap reducer merges.
4. Expect 2 channels on KDS (orders+items, staff calls) and 1–2 on the guest
   page (same socket) — that's ≈1 connection per browser tab.

## 6) Fork it for another restaurant

Update the tenant block in `supabase/seed.sql` (name, slug, WiFi in
`settings`, menu items), delete the old `restaurants` row (everything
cascades) and re-run seed. No app changes required — pages read
slug/theme/currency from `restaurants.settings`.

## 7) Known template trade-offs (hardening roadmap)

- Anonymous `SELECT` on recent orders is intentionally open (table-session
  scope, 24h cap). For stricter isolation add per-order pickup tokens.
- `place_order` has no idempotency key — double-tap is guarded in the UI
  (`placing` state), not idempotent server-side. Add a client-generated UUID
  column if you want at-most-once semantics.
- Carrier-grade rate limiting (per-IP `staff_calls` burst limits) is a
  good next step via an Edge Function or Postgres `pg_stat`-based constraint.

---

*Paddy's Kitchen — demo quality, production shape.* 
