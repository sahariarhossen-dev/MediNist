# Role-Based Access for Transactions & Dashboard

Implement strict role gates across the More menu, Daily Transactions page, route guard, and Dashboard's Cash in Hand card.

## Roles recap
- **Owner** (`role: 'owner'`): unrestricted.
- **Manager** (`role: 'manager'`): can use the page, but date filter limited to last 7 days.
- **Salesman** (`role: 'salesman'`): cannot access the page at all; Cash in Hand on Dashboard is frozen.

## Changes

### 1. `src/pages/More.tsx` — hide link for Salesman
Filter `menuItems` so the "Daily Transactions" entry is omitted when `profile?.role === 'salesman'`.

### 2. `src/pages/DailyTransactions.tsx` — route-level guard + date restriction
- At the top of the component, if `profile?.role === 'salesman'`, `<Navigate to="/more" replace />` (prevents direct URL access).
- Date filter restriction for Manager:
  - Compute `minDate = subDays(startOfDay(new Date()), 6)` (today + previous 6 days = 7-day window).
  - Pass to `<Calendar disabled={(d) => d > new Date() || (isManager && d < minDate)} fromDate={isManager ? minDate : undefined} />`.
  - Also clamp programmatic state: if `isManager && date < minDate`, reset to today on mount.
- Keep the existing `canLogTransactions = profile?.role !== 'salesman'` check (already prevents the FAB; now redundant since salesman can't reach the page, but kept as defense-in-depth).

### 3. `src/pages/Index.tsx` — freeze Cash in Hand for Salesman
- In `summaryCards`, when `profile?.role === 'salesman'`:
  - Replace Cash in Hand value with `"N/A"`.
  - Remove the `onClick` (so card isn't clickable / doesn't navigate to the blocked page).
- Skip the `fetchCashInHand` call and the realtime subscription for cash data when role is `salesman` (small perf win, avoids unnecessary queries).

### 4. `src/App.tsx` — defense-in-depth route guard
Wrap `/more/daily-transactions` (and `/more/all-transactions`) with a small inline `RoleGuard` that redirects to `/more` if `profile?.role === 'salesman'`. Reuses the existing `useAuth()` hook.

### 5. Backend / RLS — security verification
The existing RLS already restricts everything to `pharmacy_id = get_user_pharmacy_id()`, so a Salesman querying `sales`, `cash_transactions`, etc. only sees their own pharmacy's rows (same data, different page). The role-based date / page restriction is a UX/business policy, not a data-confidentiality boundary, so additional RLS is **not** required — UI guards plus the route guard are sufficient. **No DB migration needed.**

If you later want to enforce "salesman cannot read cash_transactions at all" at the DB layer, we'd add a policy like `pharmacy_id = get_user_pharmacy_id() AND NOT has_role(auth.uid(), 'salesman')` — flag if you want this and I'll add it in a follow-up.

## Files touched
- `src/pages/More.tsx`
- `src/pages/DailyTransactions.tsx`
- `src/pages/Index.tsx`
- `src/App.tsx`

No database migration. No new dependencies.