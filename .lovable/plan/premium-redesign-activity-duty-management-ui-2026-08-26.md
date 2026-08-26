# Premium Redesign: Activity & Duty Management UI

Purely frontend layout/CSS refactor. All RPCs, hooks, and data logic stay unchanged.

## 1. Hero Duty Card (merge DutyCard + MonthlySummaryCard)

Refactor `DutyCard.tsx` into a single premium card:

- Segmented toggle inside the card header: `[ Today | This Month ]` (internal local state, default `Today`). Both states read from the existing `summary` object (`duty_seconds_today/month`, `break_seconds_today/month`, `invoices_today/month`, pending deletions+discounts) — no new queries.
- 2×2 metric grid with short labels: `Duty Time`, `Break Time`, `Invoices`, `Pending`. Labels `text-[11px] uppercase tracking-wide`, no truncation (`whitespace-normal`, enough row height). Values bold tabular-nums.
- Status line at top: dot indicator + "On duty since HH:MM" / "On break since HH:MM" / "Off duty" (green/amber/muted), replacing the emoji prefix.
- `Remote lock` toggle moved to the top-right corner of the card as a compact lock icon + Switch (only when `canControl`), separated from the status row.
- Staff name header removed from the card — the name is already shown in the top selector.

`MonthlySummaryCard.tsx` deleted; `DutyControlCenter.tsx` drops its usage and the `MonthlySummaryCard` import (month view now lives in the Hero toggle).

## 2. Top header row (`DutyControlCenter.tsx`)

- Single flex row: Staff `Select` (flex-1) + compact `ExportAuditSheet` trigger button (icon + short label, `shrink-0`, `rounded-xl h-10`).
- `RedFlagBanner` stays below the header row, unchanged.

## 3. Duty action strip

- On Duty: `[ Take Break ]` (amber outline) + `[ Stop Shift ]` (outline) in a balanced 2-button flex row, `rounded-full`, `h-9`, full-width split.
- On Break: single full-width `[ Resume Duty ]` (solid emerald).
- Off Duty: single full-width `[ Start Shift ]`.
- Buttons no longer squeezed into the header's `flex-wrap`.

## 4. Filter strip & search polish (`ActivityFeed.tsx`)

- Remove the `Security` chip from `FILTERS` (keep the `security` severity type — backend logs still exist; only the chip is dropped per request).
- Search input gets `rounded-xl`, consistent `mt-1` spacing, and sits directly above the grouped feed with `space-y-3` rhythm.

## Files touched

- `src/components/staff/DutyCard.tsx` — Hero card redesign (toggle, grid, action strip, lock corner)
- `src/components/staff/DutyControlCenter.tsx` — header row layout, remove MonthlySummaryCard usage
- `src/components/staff/ActivityFeed.tsx` — remove Security chip, search spacing
- `src/components/staff/MonthlySummaryCard.tsx` — deleted

No DB migrations, no RPC changes, no logic changes.
