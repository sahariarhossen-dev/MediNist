## Goal

Extend the `ai-chat` edge function so MediNist AI can answer the new role-aware operational questions described in the brief — specifically:

- Owner: staff counts, cash vs online split, profit/loss, full sales analytics.
- Manager: last-7-days sales totals (counts + revenue), staff list, inventory — but never net profit.
- Salesman: own personal sales performance (today / 7d / 30d), plus medicine stock + rack/location. Hard refusal phrase when they ask about shop totals or other staff.

All work is server-side in `supabase/functions/ai-chat/index.ts`. No DB migration, no client change, no new tables.

## Changes

### 1. `supabase/functions/ai-chat/index.ts`

**a) Fetch additional context per role**

In `buildPharmacyContext`, after resolving role, also load:

- **Staff list** for owner and manager — `profiles` filtered by `pharmacy_id` (id, full_name, role). Used for "How many salesmen?" and staff lists.
- **Cash vs online split** for owner — pulled from `cash_transactions` (last 30d, group `direction='in'` by `category`) so the AI can answer "Today's sale — Cash vs Online".
- **Per-user sales** for salesman — `sales` filtered by `pharmacy_id` AND `user_id = currentUserId`, last 30d. Aggregate today / last 7d / last 30d totals + counts. Pass `currentUserId` into `buildPharmacyContext`.
- **Manager 7-day window** — recompute a 7-day count + revenue from the existing `sales` fetch (already 30d). Surface as "last 7 days" instead of 30d in the manager block.

**b) Update each role's data block**

- **Salesman block**: keep inventory (with rack/location field if present — check `medicines` columns; today only `name, company_name, stock_quantity, price, expiry_date, stock_alert` exist, no rack column, so note "rack/location not configured" rather than inventing). Add a new `== Your personal sales ==` section with today / 7d / 30d counts + totals scoped to `user_id`.
- **Manager block**: switch the sales summary to last-7-days revenue + count + today's count, plus a staff list (names + roles, no salaries). Keep the "no profit/cost" restriction.
- **Owner block**: add staff count + names list, and a Cash vs Online breakdown for today and last 30d derived from `cash_transactions`.

**c) Tighten the security/personality block**

Update `buildSecurityBlock` to reflect the new behaviours:

- Owner: be proactive — when asked for sales, always include Cash vs Online split.
- Manager: explicitly note "last 7 days" sales window; refuse net profit and owner withdrawals.
- Salesman: add the exact bilingual refusal from the brief —
  `"দুঃখিত, এই তথ্যটি দেখার অনুমতি আপনার নেই। আপনি শুধুমাত্র আপনার নিজের সেলস রিপোর্ট দেখতে পারবেন।"`
- For "no sales records" use the brief's phrase: `"আপনার ডাটাবেসে বর্তমানে কোনো সেলস রেকর্ড খুঁজে পাওয়া যায়নি।"`
- For staff-count questions: do not say "Contact Admin" — answer from the staff list provided.

**d) Pass `currentUserId` through**

Change `buildPharmacyContext` signature to `(supabase, pharmacyId, role, currentUserId)` so it can scope salesman queries.

### 2. No changes elsewhere

- Client (`AIAssistant.tsx`) keeps sending only `messages`.
- No DB migration. RLS already lets each member read `profiles`/`sales`/`medicines`/`cash_transactions` for their own pharmacy. (Note: `profiles` SELECT policy is `id = auth.uid()`, so the staff list query must run differently — use `shop_staff` table instead, which has an admin-only SELECT policy. For manager visibility we'll fall back to listing distinct `user_id` values from `sales` plus the current profile, OR add a dedicated SECURITY DEFINER RPC.)

**Refinement**: Because `profiles` RLS only returns the caller's own row, we cannot list staff via `profiles` for managers. Two options:

- **Option A (simple, no migration)**: For owner only, read `shop_staff` (admin-allowed). Manager gets staff *count* derived from distinct `sales.user_id` over 30d (approximate active staff) and a note that full staff directory is owner-only.
- **Option B (cleanest)**: Add a SECURITY DEFINER function `get_pharmacy_staff(pharmacy_id)` returning id/full_name/role for any authenticated member of that pharmacy. Then both owner and manager get the real staff list.

Recommend **Option B** since the brief explicitly says manager can see the staff list. This is the only schema change.

### 3. Optional DB migration (Option B)

```sql
create or replace function public.get_pharmacy_staff(_pharmacy_id uuid)
returns table (id uuid, full_name text, role text)
language sql stable security definer set search_path = public as $$
  select p.id, p.full_name, p.role
  from public.profiles p
  where p.pharmacy_id = _pharmacy_id
    and _pharmacy_id = public.get_user_pharmacy_id();
$$;
```

The `_pharmacy_id = get_user_pharmacy_id()` guard ensures a caller can only list staff for their own shop.

## Verification

- Owner asks "আজকের সেল কত?" → reply includes total + Cash vs Online split.
- Owner asks "How many salesmen?" → returns count from staff list.
- Manager asks "Last 7 days sale?" → revenue + count.
- Manager asks "Net profit?" → bilingual refusal.
- Salesman asks "আমার আজকের সেল?" → returns their personal total.
- Salesman asks "Total shop sale koto?" → exact refusal: `"দুঃখিত, এই তথ্যটি দেখার অনুমতি আপনার নেই। আপনি শুধুমাত্র আপনার নিজের সেলস রিপোর্ট দেখতে পারবেন।"`
- Empty sales → `"আপনার ডাটাবেসে বর্তমানে কোনো সেলস রেকর্ড খুঁজে পাওয়া যায়নি।"`

## Out of scope

- No UI changes.
- No rack/location field on medicines (column doesn't exist) — AI will say "rack info not configured" if asked. Adding a `rack_location` column can be a follow-up.
