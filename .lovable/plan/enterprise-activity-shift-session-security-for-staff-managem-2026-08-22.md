# Enterprise Activity, Shift & Session Security for /staff-management

## 1. What exists today

- `/staff-management` (977 lines) already has Team / Invites / Activity tabs. The Activity tab reads `staff_activity_logs` directly (admin only) with no filters, badges or pagination.
- `staff_activity_logs` is written by DB triggers on `sales`, `cash_transactions` and `customer_ledger` (`log_sale_activity`, `log_cash_transaction_activity`, `log_customer_ledger_activity`). It has `action_type`, `entity_type`, `entity_id`, `description`, `amount`, `metadata jsonb` — but no severity/risk column.
- Presence today is only `profiles.last_seen`, bumped by `touch_last_seen()`. There is no shift, screen-time, device or IP concept anywhere.
- Permission plumbing exists: `staff_access` (suspension), `staff_permissions` + `has_staff_permission()`, `is_pharmacy_admin()`, `get_user_pharmacy_id()`, and `src/lib/staffRoles.ts` with 7 permission keys.
- Auth is Supabase email/password via `AuthContext`; no PIN, no session registry.

## 2. Database & security architecture

Four new tables plus one column addition. Every table follows the house rule: CREATE TABLE -> GRANT (authenticated + service_role, no anon) -> ENABLE RLS -> policies. RLS shape is the same as `staff_access`: pharmacy admins read/write rows in their own pharmacy; a member can read and insert/update only their own row.

**`staff_shifts`** — one row per working session.
`id, pharmacy_id, user_id, started_at, ended_at, last_heartbeat_at, active_seconds int, idle_seconds int, device_label text, session_id uuid`.
Written by a heartbeat RPC, not by the client directly.

**`staff_sessions`** — device registry for "Active sessions / remote logout".
`id, pharmacy_id, user_id, session_id uuid unique, os text, browser text, device_type text, ip_hash text, first_seen_at, last_seen_at, revoked_at, revoked_by`.
IPs are stored hashed (never raw) to keep the table non-PII; the UI shows OS/browser/last-active only.

**`staff_security_settings`** — per-pharmacy owner controls.
`pharmacy_id pk, pin_lock_enabled bool default false, grace_seconds int default 60, ip_restriction_enabled bool default false, allowed_ip_hashes text[] , updated_at`.

**`staff_pins`** — `user_id pk, pharmacy_id, pin_hash text, updated_at`. Only the hash (bcrypt via pgcrypto) is stored; there is no SELECT policy for anyone — verification happens inside a security-definer `verify_staff_pin(_pin text) returns boolean` so the hash never leaves the DB.

**`staff_activity_logs.severity text default 'info'`** — `info | shift | audit | high_risk`, plus an index on `(pharmacy_id, created_at desc)` and `(pharmacy_id, severity)` so the feed stays fast at scale.

**Functions (all security definer, search_path=public, EXECUTE granted to `authenticated` only):**
- `heartbeat_shift(_session_id uuid, _active_delta int, _idle_delta int, _device jsonb)` — upserts `staff_sessions`, opens a shift if none is open, adds the deltas, updates `last_heartbeat_at`. Single statement-light upsert, called at most once per 60s.
- `verify_staff_pin(_pin text)` — rate-limited (max 5 failures / 15 min, tracked in `staff_sessions.metadata`), logs a `high_risk` entry on repeated failure.
- `set_staff_pin(_pin text)` — self-service; owner can force-reset a staff PIN via `admin_reset_staff_pin(_user_id)`.
- `revoke_staff_session(_session_id uuid)` — admin-only; marks `revoked_at`. Client polls/realtime-subscribes to its own session row and signs out when revoked (true token revocation still requires a service-role edge function call to `auth.admin.signOut`, which we add as `manage-staff-session`).
- `close_stale_shifts()` — cron-run every 15 min, closes shifts with no heartbeat for >10 min so screen-time never over-counts.

**Fraud / high-risk logging** is done by extending the *existing* triggers rather than adding new ones: `log_sale_activity` sets `severity='high_risk'` on sale delete/void and on discount above the shop default; `log_cash_transaction_activity` sets `high_risk` on cash-out above a threshold; a new `log_medicine_delete_activity` trigger on `medicines` (DELETE only) records inventory deletions. All are single INSERTs, same cost as today.

**IP restriction** is enforced at the edge, not in RLS (Postgres can't see the client IP): a `session-guard` edge function validates the request IP hash against `allowed_ip_hashes` on login and on each session registration, and the app blocks entry when it fails. Documented clearly as a soft control.

## 3. UI/UX blueprint (Activity tab)

Mobile-first (393px) enterprise look, reusing the existing card/rounded-2xl language and semantic tokens — no new colour hardcoding.

```text
┌ Activity ─────────────────────────────┐
│ KPI STRIP (2x2 grid, compact tiles)   │
│  Active now 3 | Avg shift 6h 12m      │
│  Idle today 41m | High-risk events 2  │
├───────────────────────────────────────┤
│ [All] [High risk] [Audit] [Shifts]    │  segmented filter chips
│ 🔍 search person / action              │
├───────────────────────────────────────┤
│ ● Salman F.        HIGH RISK   2m ago │  left rail colour = severity
│   Deleted product "Napa 500"          │
│   ৳— · Inventory                       │
│ ● Rahim U.         SHIFT LOG   1h ago │
│   Clocked in · Chrome / Android        │
└──────── Load more (cursor paging) ────┘
```

- Badges: `High Risk` (destructive tint), `Audit Alert` (amber), `Shift Log` (sky), `Info` (muted). Text labels always accompany colour for accessibility.
- Grouped date separators ("Today", "Yesterday"), relative timestamps via the existing `relativeTime`.
- **Sessions & Security** becomes a fourth tab (or a sheet from the Activity header): device rows with OS/browser icon, "Active now / 20m ago", and a `Sign out` action; below it the owner toggles — `PIN lock`, `Grace period` (30s/1m/2m), `Restrict to shop IP` with the current IP shown as "Add this network".
- **PIN overlay:** full-viewport blurred backdrop over the *preserved* React tree (no unmount, no reload), shop logo, staff avatar + name, 4 large dots, custom numeric keypad (no OS keyboard), shake + haptic on error, "Sign out instead" escape hatch. Appears only after the grace period elapses while hidden.

## 4. Productivity assessment (zero added lag)

- Tracking is one `visibilitychange`/`focus` listener plus a 60-second interval that accumulates deltas in a ref; a single `heartbeat_shift` RPC fires per minute and only when the tab is visible. No per-keystroke, per-route or per-query work.
- The heartbeat is fire-and-forget and never blocks render; failures are swallowed.
- The lock overlay is rendered as a sibling in `AppLayout`, so POS state, cart and open sheets survive untouched — nothing remounts, nothing refetches.
- Grace period means the common POS pattern (switch to a calculator, take a call, return in seconds) never triggers a prompt.
- Logging piggybacks on existing triggers — no new write amplification on the sales path. `complete_sale` gains no extra queries.
- Feed reads are cursor-paginated (25/page) with the new composite indexes; KPI numbers come from one aggregate RPC, not from the raw feed.

## 5. Phased implementation

**Phase 1 — DB foundation (one migration).** All four tables + GRANTs + RLS, `severity` column and indexes, `heartbeat_shift`, `close_stale_shifts` cron, extended trigger severities, `log_medicine_delete_activity`. Nothing user-visible; verify existing sales/cash/invite flows still pass.

**Phase 2 — Silent tracking.** `useShiftTracker` hook mounted once in `AppLayout`: session id in localStorage, UA parsing, minute heartbeat. No UI. Verify rows appear and stale shifts auto-close.

**Phase 3 — Activity tab rebuild.** KPI strip, severity filters, search, cursor paging, badges. Read-only, so no risk to other modules.

**Phase 4 — Sessions & owner controls.** New Sessions/Security tab, `staff_security_settings` toggles, remote logout via `manage-staff-session` edge function, IP binding with the "add this network" helper.

**Phase 5 — PIN lock.** `set_staff_pin` onboarding sheet (first sign-in after the owner enables it), `LockOverlay` in `AppLayout`, grace timer, `verify_staff_pin` with rate limiting and failure logging.

**Phase 6 — Verification.** Browser passes as owner and as salesman: confirm a salesman cannot see other members' sessions or the security toggles; confirm a 45s tab switch does not lock but 90s does; confirm an in-progress sale survives unlocking; confirm remote logout ends the session; confirm a deleted product shows as `High Risk` in the feed.

## Technical notes

- No changes to `complete_sale`, invoice or inventory business logic beyond the severity flag on existing log inserts.
- PIN is a UI-level re-auth, not an auth factor — the Supabase session stays valid; this is stated in the settings copy so expectations are honest.
- IP restriction and remote logout are enforced by edge functions with the service role; the client never holds elevated keys.
- `get_pharmacy_staff_overview()` is extended (not replaced) with `active_now`/`shift_seconds_today` so `/staff/:userId` keeps working.
