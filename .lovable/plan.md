
# MediNist AI Assistant — RBAC Audit & Hardening Blueprint

Good news: most of what you described is **already built** in `supabase/functions/ai-chat/index.ts`. Below is an honest audit of the current state, the real gaps, and a tight plan to close them.

---

## 1. What the AI currently knows about our app

The `ai-chat` edge function already does all of the following on every request:

**Identity & auth (server-side, never trusts client):**
- Validates the JWT via `supabase.auth.getUser(token)`.
- Loads `profiles.full_name, role, pharmacy_id` for the caller.
- Loads `pharmacies.name`.
- Normalises role into three buckets: `owner` (admin/owner), `manager`, `salesman`.
- Rejects users with no `pharmacy_id`.

**Live tenant-scoped data injected into the system prompt** (all filtered by `pharmacy_id`):
- `medicines` — stock, price, expiry, stock_alert (top 50 by lowest stock)
- `sales` — last 120 days, with per-day buckets + today/yesterday/7d/prev-7d comparisons
- `sale_items` — last 30 days, top sellers
- `cash_transactions` — cash-vs-online split (owner only) and supplier/expense outflows (owner + manager)
- `customers` — outstanding dues (owner + manager only)
- `get_pharmacy_member_directory` RPC — staff list (owner + manager only)

**MedEx live medicine lookup:** intent-detected per turn, scraped via Spider, cached in `medex_cache`, injected as `<pharma_data>` / `<pharma_candidates>` / `<pharma_miss>` blocks.

**Role-based system prompt (`buildSecurityBlock`)** already encodes:
- Owner → full access (revenue, profit, CPA, expenses, salaries, staff perf).
- Manager → inventory, last-7-day sales totals, staff list (names+roles), dues, expiry alerts. Forbidden: profit, CPA, expenses, salaries, sales >7d.
- Salesman → MRP, stock, rack, expiry, alternatives, **only their own** personal sales. Forbidden: CPA, shop-wide totals, profit, expenses, supplier info, other staff data, salaries.
- Hard refusal strings in Bangla + English.
- Prompt-injection guardrails (rules 7–8, untrusted `<pharmacy_data>` wrapper).

**So the answer to Q1:** the AI already has a complete picture of the schema, the caller's role/pharmacy, and a tenant-scoped live snapshot. It is not flying blind.

---

## 2. What still needs to be exposed / what's actually missing

Real gaps, in priority order:

1. **Salesman data is currently the same shop-wide snapshot as the owner's.**
   `buildPharmacyContext` fetches `sales` for the whole pharmacy regardless of role. The salesman's prompt *tells* the model not to reveal shop totals, but the **raw shop totals are still in the context**. That is a prompt-only guard, not a data guard. We should never put data into the prompt that the role isn't allowed to see.
   - Fix: when `role === "salesman"`, filter `sales` (and the derived daily buckets + top-sellers) by `user_id = currentUserId`, and omit the cash-vs-online block, dues block, expenses block, and staff block entirely. Replace the shop-wide aggregates with "Your sales — today / 7d / 30d" only.

2. **Manager sees 120 days of sales rows even though the policy says ≤7 days.**
   Same issue — policy is in the prompt, but the data window in context is 120d.
   - Fix: when `role === "manager"`, cap the `sales` window to 7 days and drop the "Previous 7 days" comparison line.

3. **Cost / purchase price (CPA) is never in the context today** (good — `medicines` select omits `purchase_price`). Keep it that way; add an assertion in code so a future edit can't accidentally add it for non-owner roles.

4. **No structured "scope" object passed to the model.** Today everything is free-form text. Adds risk that the model misreads which bucket belongs to whom.
   - Fix: prefix the context with a small machine-readable header:
     ```
     <scope role="salesman" user_id_hash="…" shop="Demo Pharmacy" allowed="own_sales,inventory,medex" forbidden="shop_totals,profit,cpa,expenses,salaries,other_staff" />
     ```
     (hash, not raw uuid — rule 7 forbids leaking IDs.)

5. **No deny-list audit log.** If a salesman *does* ask for profit, we refuse in text but never log it. Optional: insert into `staff_activity_logs` with `action_type = 'ai_denied_query'` so owners can review attempts.

6. **Client doesn't surface role to the UI** beyond the existing app. Not strictly needed for RBAC, but a small "You're chatting as **Salesman** — limited view" chip in `ChatHeader` sets expectations and reduces support load.

---

## 3. How to structure the prompt / function-calling so financial data never leaks to staff

The current architecture is the right one (server-resolved role + injected context + locked system prompt). The hardening principle is **defense in depth**:

```text
Layer 1 — Auth:        JWT validated, profile/pharmacy resolved server-side. ✅ done
Layer 2 — Data scope:  Queries in buildPharmacyContext must filter by role
                       BEFORE the data reaches the prompt.            ⚠ partial
Layer 3 — Prompt:      buildSecurityBlock encodes allow/deny + refusal. ✅ done
Layer 4 — Output:      Post-response regex sweep for forbidden tokens
                       (CPA, purchase_price, profit %, salary, other-staff
                       names) when role !== 'owner'. If found → replace
                       with the canonical refusal string.            ❌ missing
Layer 5 — Audit:       Log denied attempts to staff_activity_logs.    ❌ missing
```

Layer 2 is the most important fix. Layer 4 is a cheap belt-and-braces guard against jailbreaks.

We will **not** move to OpenAI function-calling for this — the data is small, deterministic, and already shaped for the prompt. Tools would add latency without improving safety.

---

## Step-by-step blueprint (build phase)

### Step A — Lock down `buildPharmacyContext` by role (the real fix)
In `supabase/functions/ai-chat/index.ts`:

1. Pass `role` into every query block (already passed, just use it harder):
   - `salesman`: `sales` query gets `.eq("user_id", currentUserId)`. Daily buckets, top-selling, cash-vs-online, dues, expenses, staff → all skipped.
   - `manager`: `sales` window reduced to 7 days. Cash-vs-online skipped. Keep dues + expenses + staff (names/roles only).
   - `owner`: unchanged.
2. Build three distinct `<pharmacy_data>` renderers: `renderSalesmanData`, `renderManagerData`, `renderOwnerData`. Each only outputs the sections that role is allowed to see. Today there is effectively one renderer that conditionally hides text.
3. Add a unit-style guard at the top of each renderer:
   ```ts
   assertNoForbiddenFields(payload, role);
   ```
   that throws if e.g. `cpa`, `purchase_price`, `salary`, or other-user `user_id`s slip in.

### Step B — Add the `<scope>` header
Tiny block prepended to the context. Helps the model anchor on permissions even under adversarial prompts.

### Step C — Output post-filter (role !== 'owner')
After DeepSeek returns, run a regex pass:
- Manager forbidden: `/profit|margin|CPA|purchase price|salary|বেতন|মুনাফা|লাভ/i`
- Salesman forbidden: manager list **plus** `/total sales|shop[- ]wide|other staff/i` and any staff name not equal to the caller's `full_name`.

If matched, replace the offending paragraph with the canonical refusal line. Always safe; never blocks owners.

### Step D — Audit denied queries (optional, cheap)
When the post-filter trips, `insert` a row into `staff_activity_logs`:
```
action_type: 'ai_denied_query'
description: 'AI blocked a restricted response (role=salesman)'
metadata: { matched: '<pattern>', user_query: '<first 200 chars>' }
```

### Step E — UI affordance in `src/pages/AIAssistant.tsx`
Pass `profile.role` to `ChatHeader` and render a small badge: `Owner view` / `Manager view` / `Salesman view`. Pure cosmetic, no logic change.

### Step F — Tests
Add `supabase/functions/ai-chat/role_scope_test.ts` (Deno test) that builds the context for fake owner/manager/salesman profiles using a stub Supabase client and asserts:
- salesman context contains **no** `Cash vs Online`, no `Customer dues`, no `Daily sales`, no other user's name.
- manager context contains **no** `Previous 7 days`, no sales row older than 7 days, no `Cash vs Online`.
- owner context contains all sections.

Run via `supabase--test_edge_functions`.

---

## What I will NOT touch

- The MedEx pipeline and `<pharma_*>` blocks — orthogonal to RBAC and already strict.
- The DeepSeek model choice and prompt scaffolding — working well.
- Database schema, RLS, or the spider-catalog cron — out of scope for this RBAC task.

---

## Deliverables when you approve

- Edited `supabase/functions/ai-chat/index.ts` (Steps A–D).
- New `supabase/functions/ai-chat/role_scope_test.ts` (Step F).
- Small edit to `src/pages/AIAssistant.tsx` + `src/components/ai/ChatHeader.tsx` (Step E).
- No DB migrations needed.

Approve this plan and I'll implement it in one pass.
