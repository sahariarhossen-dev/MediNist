## Goal

Upgrade `supabase/functions/ai-chat/index.ts` so MediNist AI:

1. Answers **arbitrary specific-date** sales queries (e.g., "27-4 er sale koto?") accurately, not just today/yesterday/7d/30d.
2. Knows about **expenses and payments to suppliers** (e.g., "Beximco-ke koto payment?").
3. Talks like a smart business partner — context-aware, proactive, ends with a relevant follow-up question.
4. Adapts **tone by role** (Owner = business partner, Salesman = guide).

All work is in the edge function. **No DB migration, no client change.**

## Changes to `supabase/functions/ai-chat/index.ts`

### 1. Widen sales window + build a per-day index

- Change the `sales` query window from 30 days to **90 days** (still capped at limit 500) so common date-specific questions like "27 April" hit real rows even mid-May.
- After fetching, build a `salesByDay` map: `{ "YYYY-MM-DD": { count, revenue } }` for every day in the window.
- Render a **"Daily sales (last 90 days)"** block in the owner context as compact lines:
  ```
  2025-04-27: 5 sales, ৳3286.00
  2025-04-26: 3 sales, ৳1240.00
  ...
  ```
  Only include days that actually have sales (keeps the block small).
- Manager gets the same per-day block but limited to the **last 7 days** (matches existing manager rule).
- Salesman gets per-day block scoped to **own** sales, last 30 days.

### 2. Add expenses / supplier payments context (owner only)

Add a 6th parallel query inside `Promise.all`:

- `cash_transactions` where `direction='out'` and `pharmacy_id=...`, last 90 days, limit 300, ordered by `occurred_at desc`. Select `amount, category, party_name, note, occurred_at`.

Render a new **"Expenses & supplier payments (last 90 days)"** block for owner:

- Total outflow ৳X across N transactions
- Group by `party_name` (top 15 by total amount): `Beximco: ৳12,450 (3 payments)`, etc.
- List the most recent 20 individual outflows with date, party, category, amount.

Manager gets a trimmed version (party totals only, no individual lines, last 7 days). Salesman: nothing.

### 3. Tighten security / behaviour rules in `buildSecurityBlock`

Add/update these rules:

- **Rule 9 (date-specific)** — extend: "If the user asks about ANY specific date (e.g. '27 April', '২৭-৪', '27/4'), look it up in the 'Daily sales' block by matching the YYYY-MM-DD key. If the date is missing from the block, say data for that date is not available — never approximate from a weekly/monthly total."
- **New rule 13 (Payments / Expenses)** — "When asked about payments to a supplier (e.g., 'Beximco-ke koto diyeci?'), search the 'Expenses & supplier payments' block by `party_name`. Sum matching entries and list dates. If no match, say so plainly."
- **New rule 14 (Conversational style)** — "End every substantive answer with ONE short, relevant follow-up question that helps run the pharmacy better (e.g., 'ajker due list ta dekhabo?', 'kon medicine stock-e kom seta check kori?'). Skip the follow-up only for refusals and trivial acknowledgements."
- **New rule 15 (Tone by role)**:
  - Owner → speak like a business partner: mention growth/decline vs prior period when relevant, use words like profit/loss/trend.
  - Manager → operational coach tone.
  - Salesman → friendly guide: focus on stock, price, alternatives. Never mention profit.
- **New rule 16 (Sentiment)** — "If the user sounds worried (e.g., 'sale kom keno?'), acknowledge briefly, then analyse using the data (compare to previous day/week, point at low-stock or expiry issues if relevant)."
- **New rule 17 (Comparisons)** — "When the user asks the same metric repeatedly or asks 'kemon cholche', proactively compare today vs yesterday and this week vs last week using the per-day block."

### 4. Minor cleanup

- Increase `max_tokens` from 1024 → 1400 to fit the longer, more conversational answers + follow-up question.
- Keep `temperature` at 0.7.
- Update the inventory-block "rack info not configured" note to also remind the salesman role to suggest an alternative medicine if stock is 0.

## Verification scenarios

- Owner asks "27-4 er sale koto?" → answers with that exact date's count + revenue from the daily block, ends with a follow-up like "ajker due list ta dekhabo?".
- Owner asks "Beximco-ke koto payment koreci?" → sums supplier payments to Beximco, lists dates, ends with "baki supplier der pending amount jante chan?".
- Owner asks "Sale kom keno?" → sympathises, compares today vs yesterday + this week vs last week, suggests a check (low stock / expired items).
- Salesman asks "Napa ase?" → gives stock + price; if 0, suggests alternative; ends with a guide-style follow-up.
- Manager asks "Net profit?" → still refused with the existing exact phrase (no follow-up).
- Owner asks about a date with no sales → says data not available for that date (no fabrication).

## Out of scope

- No new DB columns, no rack/shelf data, no `expenses` table (uses existing `cash_transactions` with `direction='out'`).
- No frontend / `AIAssistant.tsx` changes.
