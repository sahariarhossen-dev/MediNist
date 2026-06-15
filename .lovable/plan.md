## Goal
Extract `buildPharmacyContext` (and its role-scoping helpers) from `supabase/functions/ai-chat/index.ts` into a standalone module so it can be unit-tested with a mocked Supabase client. Add a Deno test suite that asserts RBAC scoping for owner / manager / salesman.

## Current layout
```text
supabase/functions/ai-chat/
  index.ts        1256 lines — Deno.serve + auth + buildScopeHeader + buildSecurityBlock + buildPharmacyContext + MedEx + post-filter
```
`buildPharmacyContext` lives at lines 575–~1090 and is only called once (line 1103).

## Target layout
```text
supabase/functions/ai-chat/
  index.ts                  HTTP routing + auth + orchestration only
  context/
    contextBuilder.ts       buildPharmacyContext + render helpers + assertNoForbiddenFields + Role type
    contextBuilder_test.ts  Deno tests with a stub Supabase client
  (existing) buildScopeHeader / buildSecurityBlock stay in index.ts for now (small, prompt-only)
```

Note: Deno edge functions support subfolders for *imports* from `index.ts`; Supabase only treats `index.ts` as the entry. The "no subfolders" rule in our guidelines is about not splitting *entry points* — co-located helper modules imported by `index.ts` are fine and already used elsewhere in this project.

## Step 1 — Create `context/contextBuilder.ts`
Move out of `index.ts`:
- `type Role = "owner" | "manager" | "salesman"`
- `buildPharmacyContext(supabase, pharmacyId, role, currentUserId): Promise<string>`
- Any private helpers it calls (date bucketers, formatters, `assertNoForbiddenFields`).

Export shape:
```ts
export type Role = "owner" | "manager" | "salesman";
export interface SupabaseLike { from: (t: string) => any; rpc: (n: string, a?: any) => any }
export async function buildPharmacyContext(
  supabase: SupabaseLike,
  pharmacyId: string,
  role: Role,
  currentUserId: string,
): Promise<string>;
export function assertNoForbiddenFields(payload: unknown, role: Role): void;
```

Keep all existing role-scoping behavior verbatim (salesman: own user_id only, no sale_items/dues/cash/staff; manager: 7-day sales + expenses cap; owner: unchanged).

## Step 2 — Slim `index.ts`
- Remove the moved code.
- Add `import { buildPharmacyContext } from "./context/contextBuilder.ts";`
- `Deno.serve` handler stays focused on: CORS → JWT auth → load profile/pharmacy → role normalization → call `buildPharmacyContext` → MedEx → DeepSeek → post-filter → response.
- No behavioral change.

## Step 3 — `context/contextBuilder_test.ts`
Deno test file with a hand-rolled `SupabaseLike` stub that:
- Records every `.from(table).select(...).eq(...).gte(...)` call into a query log.
- Returns canned rows for `medicines`, `sales`, `sale_items`, `cash_transactions`, `customers`, `expenses`, and RPC `get_pharmacy_member_directory`.

Tests:

1. **salesman scoping** — call `buildPharmacyContext(stub, "pharm-1", "salesman", "user-A")`:
   - Assert the `sales` query log contains `eq("user_id", "user-A")`.
   - Assert no query was made for `sale_items`, `customers`, `cash_transactions`, or the staff RPC.
   - Assert the returned context string contains "Your sales" and does NOT contain `Cash vs Online`, `Customer dues`, `Daily sales`, or any other staff user_id.

2. **manager 7-day cap** — call with `role="manager"`:
   - Assert the `sales` query log contains `gte("created_at", <ISO date within last 7 days, ±1 min tolerance>)`.
   - Assert the `expenses` (cash_transactions outflow) query also uses the 7-day window.
   - Assert no `Cash vs Online` block and no `Previous 7 days` comparison string in the output.
   - Assert staff directory RPC IS called (manager allowed).

3. **owner full access** — call with `role="owner"`:
   - Assert sales window is 120 days (matches existing behavior).
   - Assert `Cash vs Online`, `Customer dues`, `Daily sales`, and staff directory all appear in the output.
   - Assert no `eq("user_id", ...)` filter on `sales`.

4. **assertNoForbiddenFields** — direct unit test:
   - Salesman payload containing `purchase_price` throws.
   - Manager payload containing `salary` throws.
   - Owner payload with both passes.

Test scaffolding:
```ts
import { assertEquals, assertStringIncludes, assertThrows }
  from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildPharmacyContext, assertNoForbiddenFields }
  from "./contextBuilder.ts";

function makeStub(fixtures: Record<string, any[]>) {
  const calls: Array<{ table: string; ops: any[] }> = [];
  // chainable .select/.eq/.gte/.order/.limit returning { data, error }
  // record ops on each call
  return { stub, calls };
}
```
No network, no env vars — runs offline.

## Step 4 — How to run
The user runs tests via the Lovable interface, not the terminal. After this lands they can ask "run the ai-chat tests" and we'll invoke `supabase--test_edge_functions` with `{ functions: ["ai-chat"] }`. The tool auto-discovers `*_test.ts` files inside the function folder.

## Out of scope
- No DB migrations.
- No changes to `buildScopeHeader`, `buildSecurityBlock`, MedEx pipeline, post-filter, or UI.
- No DeepSeek/model changes.

## Deliverables
- New `supabase/functions/ai-chat/context/contextBuilder.ts` (moved code, zero behavior change).
- New `supabase/functions/ai-chat/context/contextBuilder_test.ts` (4 tests above).
- Edited `supabase/functions/ai-chat/index.ts` (import + removed inlined function).

Approve and I'll implement in one pass, then run the test suite and report results.