## MediNist E2E Audit — Findings & Fix Plan (no code changes yet)

Scope: Shop Registration, Staff Invitation/Acceptance, Add/Edit Product, Sales + Stock Deduction. Each section lists the high-risk bug, why it breaks in production, and the targeted fix to apply later.

---

### 1) Shop Registration (`register-pharmacy` + `src/pages/Register.tsx`)

What works: input validation, name-uniqueness pre-check, pharmacy → auth user → profile-update → sign-in sequence with rollback on profile-promotion failure.

High-risk bugs:

- **R1 — Silent dead-end on auto-login failure.** Edge function returns `200 { error: "...auto-login failed..." }` (intentionally a 200). Client `handleSubmit` does `if (res.error)` then `if (data?.error)` (toast) then `if (data?.session)` navigate. When `data.error` is set, we toast but do NOT redirect to `/login`, and we don't surface the fact that the **account was created**. User assumes registration failed and re-submits → "email already exists" loop.
- **R2 — Race on duplicate shop name.** Frontend debounces an `ilike` check; the edge function repeats it but `pharmacies.name` has **no unique index** (verified in schema). Two near-simultaneous registrations create duplicate pharmacy rows. The second user becomes admin of a stale empty pharmacy.
- **R3 — Generic 400 swallows DB detail.** Pharmacy insert errors return `"Failed to create pharmacy"` only. When the real cause is a constraint, RLS, or missing GRANT, we lose it. Same for `createUser` (returns `"Failed to create user account"`).
- **R4 — Rollback gap.** If `signInWithPassword` throws (not just `signInError`), the catch returns a generic 500 but the user + pharmacy + admin profile already exist. There is no cleanup of the orphan auth user when the *sign-in* leg fails (only the *profile-promotion* leg cleans up).
- **R5 — Stale-session contamination.** `Register.handleSubmit` does `supabase.auth.signOut()` before invoking, but the **edge function still receives the Authorization header** Supabase adds when a session exists at request build time. Not currently fatal, but it explains why a leftover JWT from a previously deleted user can attach.

Fix plan:
1. Treat any `data.error` response from `register-pharmacy` as terminal: show toast, then route to `/login` with the email prefilled when the message contains `"auto-login failed"`.
2. Add a UNIQUE index on `lower(name)` for `public.pharmacies` (case-insensitive) and convert the edge-function check to handle the 23505 conflict cleanly.
3. Propagate the real Postgres error message (without leaking internals) — return `error.message` from `pharmacyError` / `authError` and log full detail server-side.
4. Wrap the whole edge-function body in a single try/finally that, on any thrown error after pharmacy/auth creation, deletes the auth user and the pharmacy.
5. Force a fresh anon client inside `handleSubmit` to invoke `register-pharmacy` (no Authorization header attached).

---

### 2) Staff Creation & Tenant Linking (`invite-staff` + `accept-invitation` + `accept_staff_invitation` RPC)

What works: invite generation via service role, token revocation on the table, SECURITY DEFINER acceptance RPC, `handle_new_user` trigger creating a default `profiles` row.

High-risk bugs:

- **S1 — Existing-email recovery uses caller-supplied password.** In `accept-invitation/index.ts` if `createUser` fails with "already registered", we call `signInWithPassword({ email, password })` using the *new* password the invitee typed. If a real account exists with a different password, the invitee gets a generic 409 and cannot proceed. Also a mild account-enumeration vector (different message for "exists" vs "bad password").
- **S2 — `profiles.full_name` set with admin client without bypass.** Update happens before `accept_staff_invitation` runs, which is fine for `full_name` but if a `prevent_role_change`/`prevent_pharmacy_id_change` trigger ever extends to additional columns the update will silently fail (currently it only logs a warning, never bubbles to the user).
- **S3 — Client falls back to anon-key GET for invite lookup.** `AcceptInvitation.tsx` does a raw `fetch` with the publishable key as both `apikey` and `Authorization`. If the invitation row is created but `get_invitation_by_token` returns the row only when expiry/status match, a `null` row is reported as `"Invitation not found"` even when expired. We then never surface "expired" vs "missing" properly. (Current code partially compensates but the GET endpoint returns 404 with `Invitation not found` for both cases.)
- **S4 — No re-fetch after revoke/resend.** `ShopProfile.fetchStaff` selects explicit columns now (good after the token revoke), but never subscribes/refetches after `handleResendInvite`/`handleRevokeInvite`, so the row's new `status` is stale until manual refresh in some paths.
- **S5 — `accept_staff_invitation` writes role bypassing guards.** Correct, but `handle_new_user` always inserts `role='salesman'` on new auth users. If an admin invites a user as `admin`/`manager`/`owner`, the role briefly is `salesman` between auth-create and the RPC. Any race-read of profile by another session would see the wrong role. Low risk but worth noting.
- **S6 — DebugPanel left in production UI.** It exposes the raw token (and URL) on screen for any visitor of the `/accept-invitation` page. Once we confirm the flow works it must be removed.
- **S7 — `invite-staff` always returns 200 with `emailSent:false`.** No transactional email is sent. Admin must copy the link manually. Confirm this is intentional; otherwise wire up the email send (Resend / Lovable transactional).

Fix plan:
1. On "user already exists" in `accept-invitation`: do **not** try the supplied password. Look up the existing user via `admin.auth.admin.listUsers`/`getUserByEmail`, ensure their `id` matches no existing `shop_staff.user_id`, then run only the linking RPC (after the user signs in separately). Return 409 with a clear "This email is already registered — please log in first, then re-open the invitation link."
2. Change `get_invitation_by_token` to also return a distinct `not_found` vs `expired` vs `revoked` shape, and surface that in the GET response. Stop returning 404 for valid-but-expired invitations.
3. Make `accept-invitation`'s profile-name update raise on error (not just warn) — this guards against future profile trigger changes.
4. In `ShopProfile.tsx`, call `fetchStaff()` after every resend/revoke (already done in some places; audit all branches).
5. Remove the on-screen `DebugPanel` from `AcceptInvitation.tsx` and gate it behind `import.meta.env.DEV` only.
6. Decide on the email path — either ship transactional email or update the UI copy to make "copy the link manually" the explicit primary action.

---

### 3) Product Management (`AddProduct.tsx`, `Inventory.tsx`)

What works: payload matches the `medicines` schema (`pharmacy_id`, `name`, optional packaging fields), defaults to `pcs_per_strip=1`/`strip_per_pack=1` for single-unit products, edit branch reuses payload.

High-risk bugs:

- **P1 — Generic error toast.** Save handler shows `"Failed to save product"` / `"Failed to update product"` regardless of cause (RLS violation, missing pharmacy, conflict). The actual Postgres message (e.g. "violates check constraint", "permission denied") is dropped. This is the #1 reason setup failures look mysterious.
- **P2 — `pcs_per_strip` / `strip_per_pack` may save as `null`.** When `usesStripPack` is true but the user leaves the fields blank, payload sends `null`. `CreateSale.tsx` then computes pieces with `(pcs_per_strip ?? 1)` for some branches but not all — a strip-priced product with `null` pack size will silently sell as 1 piece per strip, corrupting stock counts.
- **P3 — Stock not validated on add.** `Inventory.addStock` (line ~307) does `Math.max(0, (med.stock_quantity || 0) + addedPieces)` without verifying `addedPieces` is a finite positive integer. Pasting "abc" or a negative number yields NaN → DB error or `0`.
- **P4 — Local state drift on edit.** `AddProduct.handleSave` navigates back to `/inventory` without invalidating the inventory cache, so the list shows the old row until the page is force-refreshed (depends on how Inventory fetches).
- **P5 — `editId` taken from URL with no auth-check.** Anyone with a known UUID could navigate to `/add-product?edit=<id>` and submit. RLS on `medicines` is the only guard; verify the UPDATE policy is `pharmacy_id = get_user_pharmacy_id() AND is_pharmacy_admin_or_manager()` (or equivalent). If not, restrict in the UI as well.

Fix plan:
1. Replace the catch-all toast with `toast.error(error.message)` and log the full error to console for debugging. Add a follow-up generic message only when `error.message` is empty.
2. When `usesStripPack` is true, require `pcs_per_strip > 0` and `strip_per_pack > 0` in `canSave`; otherwise force them to `1` (don't allow `null` to flow into DB for strip-mode products).
3. Validate numeric inputs in `Inventory.addStock` (`Number.isInteger`, `> 0`) before sending.
4. After insert/update in `AddProduct.handleSave`, refetch on the Inventory page (use a query invalidation or pass a refresh flag in navigation state).
5. Audit `medicines` RLS policies (UPDATE/DELETE) to confirm only admin/manager of the same pharmacy can mutate, and reflect the same gating in the UI.

---

### 4) Sales & Inventory (`CreateSale.tsx`)

What works: schema payload for `sales` and `sale_items` matches DB (`user_id`, `pharmacy_id`, `status`, `subtotal`, `discount_*`, `total`); sale-items use canonical "pieces" units; `log_sale_activity` trigger handles the audit log server-side.

High-risk bugs:

- **SI1 — No atomic transaction across `sales` + `sale_items` + stock decrement.** Each step is a separate client RPC. If `sale_items.insert` fails after `sales.insert`, an empty completed sale stays in the DB (orphan total without lines). If a single `medicines.update` decrement fails midway, the cart partially deducts stock; client throws and stops.
- **SI2 — Stock deduction is non-atomic and racy.** Line 385: `newStock = Math.max(0, (c.medicine.stock_quantity || 0) - getItemPieces(c))`. Two cashiers selling the same product simultaneously both read the same `stock_quantity` and both write a too-high value. Negative real stock results.
- **SI3 — Cash-sales aren't posted to `cash_transactions`.** The only insert into `cash_transactions` happens in the `selectedCustomer && (due|split)` branch when `paymentMethod === 'split'` and only for the `paid` portion. Pure cash sales (most common path) never write a `cash_transactions` row — `submit_blind_closing` instead derives sales cash from the `sales` table directly, so it's not double-counted, but any downstream report that *expects* a `cash_transactions` row for a cash sale will under-report. Need to confirm the canonical source of truth and document it.
- **SI4 — Draft → completed conversion deletes & re-inserts items without rolling back stock.** When converting a draft (`draftId` branch) we delete and re-insert `sale_items` cleanly, but if the original draft already had a status of completed (edge case via direct DB edits), we'd double-decrement stock. Guard with `status='draft'` before this branch runs.
- **SI5 — Customer due/payment posting after partial failure.** If `customer_ledger.insert` fails (RLS / missing customer) we `throw`, but the sale rows and stock decrements have already happened. User retries and creates duplicate sales.
- **SI6 — `cartItems` validation gap.** `getItemPieces` for `mode='strip'` multiplies by `pcs_per_strip ?? 1`; combined with P2 above this collapses to "1 piece per strip" for malformed products. Cart total looks tiny; sale completes; stock corrupted.
- **SI7 — No optimistic-lock check on edit-sale.** `Sales.tsx` edit path likely re-uses `CreateSale.tsx`; if two devices edit the same sale, last write wins with no version check.

Fix plan:
1. Move sale completion into a `SECURITY DEFINER` Postgres function `complete_sale(_sale jsonb, _items jsonb[])` that runs the insert/update + stock decrement + ledger posting in **one transaction**, returning the new sale id. Client just calls the RPC.
2. Inside that function, use `UPDATE public.medicines SET stock_quantity = GREATEST(0, stock_quantity - _qty) WHERE id = _id RETURNING stock_quantity` — atomic per row and race-safe. Optionally raise when result would go negative and the pharmacy setting forbids overselling.
3. Decide and document whether cash sales should land in `cash_transactions`. If yes, the new RPC inserts a `category='sale_cash'` row tied to `sale_id`. If no, remove the partial split-payment insert to keep one source of truth.
4. Guard the draft → completed conversion: only run the delete+re-insert path when the existing row's `status='draft'`. Otherwise treat as edit-only and skip stock changes (or compute deltas).
5. In all client catch blocks, surface `error.message` so RLS / constraint / network failures are visible instead of generic "Failed to save sale".
6. Add a UI confirmation when `pcs_per_strip`/`strip_per_pack` is missing for a product the cashier picked in strip mode (block the sale until the product is fixed).
7. Add a `version` (or `updated_at`) check on edit-sale RPC to detect concurrent edits.

---

### Cross-cutting issues

- **C1 — `toast.error("...")` masks Postgres detail in 8+ places.** Standardize on `toast.error(err.message ?? "Something went wrong")` and `console.error(err)` so production logs and the UI both carry the real reason.
- **C2 — No global network/offline handler.** Failed `supabase.functions.invoke` calls only surface via per-handler `try/catch`. A wrapper would catch network drops uniformly and offer a retry button.
- **C3 — Debug UI in production.** Remove the `DebugPanel` from `AcceptInvitation.tsx` after confirming the flow works. Optionally also remove the `console.log` calls there.
- **C4 — Missing UNIQUE / partial constraints worth adding:** `pharmacies(lower(name))`, `shop_staff(pharmacy_id, lower(email))` (already partial via the upsert `onConflict`), `medicines(pharmacy_id, lower(name), coalesce(lower(company_name),''))` to prevent duplicate product rows from manual catalog imports.

---

### Suggested execution order (when you give the go-ahead)

1. **Diagnostics first (1–2 edits, zero schema):** make every `toast.error` show the real message; remove DebugPanel; add a `console.error` companion. This alone will tell us what's actually failing in client setups.
2. **Registration hardening (R1 + R3 + R5):** fix the auto-login dead-end, propagate real errors, force fresh anon client.
3. **Invitation hardening (S1 + S2 + S6):** stop using the invitee's password for existing-account recovery, raise on profile-name failure, remove DebugPanel.
4. **Product hardening (P1 + P2 + P3):** real error toasts, strict pack-size validation, numeric stock-add validation.
5. **Sales atomicity (SI1 + SI2 + SI4):** move sale-completion into a single `complete_sale` SQL function with atomic stock decrement.
6. **Schema constraints (R2 + C4):** add unique indexes — last because they need a one-off data dedupe migration first.

Each step is independently shippable so we can verify in production between phases. Tell me which phase to start with and I'll move into build mode.
