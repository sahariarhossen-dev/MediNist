# Remove "Today's Red Flags" Banner from Activity Tab

## Goal
Strip the red-flag summary banner from the top of the Activity tab in `/staff-management` so the header row (staff selector + export) sits directly above the Hero Duty Card.

## Changes
1. **Delete component file**
   - Remove `src/components/staff/RedFlagBanner.tsx` entirely.

2. **Update `src/components/staff/DutyControlCenter.tsx`**
   - Remove the `RedFlagBanner` import.
   - Remove the `<RedFlagBanner ... />` JSX block between the header row and `<DutyCard />`.
   - Keep `userFilter`, `summary`, `refreshKey`, `feedFilter`, and `setFeedFilter` untouched — they are still required by `DutyCard`, `ApprovalQueue`, `StaffPresenceStrip`, and `ActivityFeed`.

3. **Verify cleanup**
   - Confirm no other files reference `RedFlagBanner`.
   - Run TypeScript type-check to ensure no broken imports or unused state.

## Outcome
- Cleaner Activity tab layout with header → Hero Duty Card → Approval Queue → Presence Strip → Activity Feed.
- No orphaned component or dead code.
