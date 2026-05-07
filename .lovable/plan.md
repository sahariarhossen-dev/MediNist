## Goal

Extend `supabase/functions/ai-chat/index.ts` so MediNist AI handles the new master-prompt behaviours:

- **Yesterday / specific-day** sales queries (not just "last 30 days").
- **Total shop due** and **per-customer due** lookups, with a bilingual "no dues" fallback.
- **Staff count** answered directly (already implemented — re-affirmed in prompt).
- **Rack/location** — schema has no column, so AI will say "rack info not configured" (unchanged).

All work is server-side. **No DB migration, no client change.**

## Changes

### 1. `buildPharmacyContext` — fetch + summarise more data

Inside the existing `Promise.all`, add two more queries (both gated by role):

- `customers` — `id, name, phone, total_due` for `pharmacy_id`, where `total_due > 0`, ordered desc, limit 50. Fetched for **owner + manager** (salesman skipped).
- Keep current `sales` 30d fetch — already enough to derive today / yesterday / last 7 / last 30 buckets in code.

Compute date buckets once and pass them into each role block:

- `todayStr` = today (already exists)
- `yesterdayStr` = today − 1 day (new)
- Per role, output explicit lines:
  - `Today: N sales, ৳X`
  - `Yesterday: N sales, ৳X`
  - `Last 7 days: N sales, ৳X`
  - `Last 30 days: N sales, ৳X` (owner only; manager stops at 7d per existing rule)
- Salesman: same buckets but scoped to `user_id = currentUserId`.

Add a new **Dues block** for owner + manager:

```
== Customer dues (outstanding) ==
Total customers with due: K
Total outstanding due: ৳<sum of total_due>
Top 20 by amount:
- <name> (<phone>): ৳<total_due>
...
```

Salesman role does NOT receive the dues block.

### 2. `buildSecurityBlock` — tighten the personality / rules

Add to the rules section (rule 9+):

- **Date-specific queries**: "If user asks about a specific day (today, yesterday, a date), answer ONLY for that day from the per-day buckets provided. Do not return the 30-day total when a specific day is requested."
- **Dues**: "When asked total/outstanding dues, sum from the dues block. When asked about a specific customer's due, look them up by name in the dues block. If no dues records exist at all, reply EXACTLY: `আপনার ডাটাবেসে বর্তমানে কোনো বকেয়া বা ডিউ রেকর্ড নেই।`"
- **Staff count** — re-state: never say "Contact Admin"; answer from staff directory.
- **Formatting**: prefer bullet points and **bold numbers** for mobile readability.
- **Rack/location**: if asked, say "rack/shelf information is not configured for this shop yet" (no hallucination).

Update the manager rule to explicitly include "customer due list" as allowed (currently implied only).

### 3. No other changes

- No DB migration — `customers.total_due` already exists.
- No client (`AIAssistant.tsx`) change.
- Salesman flow unchanged except their personal-sales block now also shows a `Yesterday` line.

## Verification

- Owner: "গতকালের বিক্রি কত?" → only yesterday's count + revenue (not 30d sum).
- Owner: "মোট কত টাকা বাকি?" → sum of `customers.total_due` + top customers list.
- Owner: "Rahim er due koto?" → looks up Rahim in dues block, returns his balance, or says not found.
- Empty dues table → `আপনার ডাটাবেসে বর্তমানে কোনো বকেয়া বা ডিউ রেকর্ড নেই।`
- Manager: "Last 7 days sale?" → still works; "Net profit?" → still refused.
- Manager: "Total due?" → answers from new dues block.
- Salesman: "আমার গতকালের সেল?" → personal yesterday total.
- Salesman: "Total shop due?" → existing salesman refusal phrase.
- Owner: "How many salesmen?" → answers from staff directory (already working, re-affirmed).

## Out of scope

- No `rack_location` column added — separate follow-up if the user wants real rack data.
- No changes to `customer_dues` table or RLS.
