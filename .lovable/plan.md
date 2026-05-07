## Goal

Upgrade the `ai-chat` edge function from the current 2-tier (admin/staff) model to the requested 3-tier hierarchy — **Owner (admin), Manager, Salesman** — with the exact security rules, refusal phrases, and role-filtered data described in the brief.

The role already exists on `profiles.role` (values: `admin`, `manager`, `salesman`), so no DB change is required. All work is server-side in `supabase/functions/ai-chat/index.ts`. The client (`AIAssistant.tsx`) does not need to send the role — the function resolves it from the authenticated session, which is the secure approach.

## Changes

### 1. `supabase/functions/ai-chat/index.ts`

**a) Map profile role to a 3-tier permission level**

```ts
type Role = "owner" | "manager" | "salesman";
const roleRaw = (profile.role ?? "salesman").toLowerCase();
const role: Role =
  roleRaw === "admin" ? "owner" :
  roleRaw === "manager" ? "manager" : "salesman";
```

(`admin` is treated as Owner since the app uses `admin` for shop owners.)

**b) Replace `buildSecurityBlock` with a 3-tier rules block**

Rules per role, embedded in the system prompt:

- **Owner** — full access: sales, profit, margin, cost, expenses, inventory, supplier info, staff salaries, staff performance.
- **Manager** — operational: inventory, stock updates, sales records, staff attendance/activity. Refuses profit/loss and owner-only financials with: `"Sorry, this information is restricted to the shop owner."` / `"দুঃখিত, এই তথ্যটি দেখার অনুমতি আপনার নেই।"`
- **Salesman** — limited: product price (selling/MRP only), stock availability, rack/location, alternatives. Strictly forbidden from purchase/cost price (CPA), shop profit, revenue totals, other staff's data. Refuses with the same bilingual phrase.

The block also keeps the existing anti-prompt-injection and "no other shop's data" rules.

**c) Update `buildPharmacyContext` to filter data per role**

- **Owner**: keep the existing admin branch (revenue, top-selling, totals, low-stock, all medicine fields including `price`).
- **Manager**: inventory + sales counts + today's count + low-stock list + recent sales activity (counts only, no revenue/profit). Strip `price` from medicine listing only if it is treated as cost; selling price is fine. Cost data is not in `medicines` today, so nothing to strip — but the prompt forbids volunteering money totals.
- **Salesman**: inventory listing with name, company, stock, selling price, expiry, rack/location. **Exclude** any sales aggregates entirely. Only return inventory data block.

**d) Refusal language**

The system prompt instructs the model to reply in the user's language (Bangla or English). When refusing, prefer Bangla if the user wrote in Bangla/Banglish, English otherwise — matching the brief's two refusal strings:
- `"দুঃখিত, এই তথ্যটি দেখার অনুমতি আপনার নেই।"`
- `"দুঃখিত, এই ওষুধটি আমাদের ইনভেন্টরিতে নেই।"` (when a medicine is not in DB)

**e) Logging**

Update the `console.log` to include the resolved 3-tier role for debugging.

### 2. No client changes required

`src/pages/AIAssistant.tsx` continues to send only `messages`. Role is resolved server-side from the JWT — this is the correct, tamper-proof approach (a client-supplied role could be spoofed).

### 3. No DB migration

`profiles.role` already supports `admin` / `manager` / `salesman`.

## Out of scope

- No UI changes to the chat.
- No new tables, RLS, or secrets.
- Existing prompt-injection guards and "single shop only" rules are preserved.

## Verification

- As an `admin` user: ask "Today's profit?" → returns numbers.
- As a `manager` user: ask "Today's profit?" → bilingual refusal; ask "Low stock items?" → returns list.
- As a `salesman` user: ask "Cost price of Napa?" → refusal; ask "Napa stock koto?" → returns stock + selling price.
- Ask about a non-existent medicine → returns the "not in inventory" Bangla phrase.
