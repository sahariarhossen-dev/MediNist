## Goal

Tighten `supabase/functions/ai-chat/index.ts` so MediNist AI never falls back to "data not saved" for legitimate date queries, can answer expense questions for any specific date, and proactively compares periods.

All work is in the edge function. No DB migration, no client change.

## Changes to `supabase/functions/ai-chat/index.ts`

### 1. Per-day expenses map (owner + manager)

Inside `buildExpensesBlock`, after grouping by party, also build a `Map<string, { count, total, byParty: Map<string, number> }>` keyed by `YYYY-MM-DD` from the scoped `expenses` array. Render an additional section:

```
== Daily expense totals (last N days) ==
2025-04-27: 3 payments, ৳12,450 — Beximco ৳8,000; Square ৳4,450
2025-04-26: 1 payment, ৳2,000 — Acme ৳2,000
...
```

Owner gets full list (last 90d). Manager gets last 7d only.

### 2. Tighten rule 18 (specific-date lookup)

Update rule 18 so it explicitly covers BOTH sales and expenses/supplier payments. For ANY specific-date question:
- Sales → look up the date in the "Daily sales" block.
- Expenses / payments → look up the date in the "Daily expense totals" block.
- If the date key is missing, reply plainly: `"ঐ তারিখে কোনো সেল/খরচ রেকর্ড করা হয়নি"` — never approximate from weekly/monthly totals, never say generic "ডাটা সেভ করা নেই".

### 3. Strengthen rule 17 (comparisons)

Replace with explicit phrasing: when answering any sales/business-health question, ALWAYS compute and mention comparison vs prior comparable period (today vs yesterday, this week vs last week). Frame as an insight ("আজকের বিক্রি গতকালের চেয়ে ১৫% কম"), not a raw stat dump. Pre-compute `prev7Revenue` / `prev7Count` (days 8–14 ago) and surface them in the owner sales block as `Previous 7 days: N sales, ৳X` so the model has the comparison number ready.

### 4. New rule 19 — "no fake 'not saved'" guardrail

NEVER respond with generic "ডাটা সেভ করা নেই" / "data is not saved" when the user asks for a specific day. Correct responses, in order:
1. Date present in the per-day block → answer with that day's numbers.
2. Date absent (within window) → `"ঐ তারিখে কোনো সেল/খরচ রেকর্ড করা হয়নি"`.
3. Date older than the loaded window (e.g. older than 120d for sales, 90d for expenses) → `"৯০-১২০ দিনের বাইরের ডাটা এই মুহূর্তে available নেই, owner চাইলে আমরা window বাড়াতে পারি।"`

### 5. Salesman alternatives

When stock is 0 or low for a requested medicine, suggest up to 2 alternatives from the inventory list (matching `company_name` first, then similar `name` prefix). End with guide-style follow-up like "aro kichu khujchen?". Add this as a one-liner in rule 5 (salesman section) and as a hint at the bottom of the salesman inventory block.

### 6. Tiny cleanup

- `sales` query window: 90 → **120 days** (still capped at limit 500).
- `max_tokens`: 1400 → **1600**.
- Rename `Daily sales (last 90 days)` label to `Daily sales (last 120 days)` in the owner block to match.

## Out of scope

- No new DB columns, no new tables, no frontend changes.

## Verification scenarios

- Owner asks "27-4 er sale koto?" → exact-day numbers + WoW comparison + follow-up.
- Owner asks "26-4 e Beximco-ke koto diyeci?" → reads Daily expense totals for 26-4, returns Beximco line + follow-up.
- Owner asks about a date with no entries → `"ঐ তারিখে কোনো সেল রেকর্ড করা হয়নি"` (NOT "data is not saved").
- Owner asks "Sale kom keno?" → acknowledges, gives today vs yesterday + this week vs last week percentages, suggests stock check, follow-up.
- Salesman asks "Napa ase?" with stock 0 → "Napa stock-e nei. Bikolpo: Ace 500, Fast 500. Aro kichu khujchen?"
- Manager asks "Net profit?" → still refused with exact phrase, no follow-up.
