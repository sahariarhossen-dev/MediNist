# Activity Tab: Drop Routine Sales

## Goal
The Activity feed shows only duty/shift events and high-risk/audit events. No routine "Recorded sale of ..." entries, no toggle to bring them back.

## Changes (all in `src/components/staff/ActivityFeed.tsx`)

1. **Remove the toggle** — delete the "Include routine sales" `Switch` row, the `includeSales` state, and the now-unused `Switch` import.
2. **Always exclude routine sales** — the log query permanently filters out `action_type = 'sale'` rows whose severity is `info`. Non-routine sale events (voided sales, high-discount flags, audit-severity sale rows) still appear because they are not `info` severity.
3. **Keep everything else as is** — filter chips (All / High risk / Audit / Shifts), search field, staff filter, shift rows merged into the timeline, cursor pagination, date grouping, card styling.

## Notes
- Frontend/presentation only: no database, RPC, or logging changes; sales are still logged, just not displayed here.
- The `All` chip now means "all non-routine activity".
