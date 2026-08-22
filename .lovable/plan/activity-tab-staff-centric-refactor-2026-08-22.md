# Activity Tab: Staff-Centric Refactor

## Goal
Turn the Activity tab from a raw log dump into a security- and shift-focused view: routine sales hidden by default, per-staff filtering, and a "Today's presence" strip.

## 1. Hide routine sales by default
- Default feed query excludes rows where `action_type = 'sale'` and `severity = 'info'` (voided/high-risk/discount-flagged sales still show).
- Compact toggle `Include routine sales` (off by default) next to the filter chips; turning it on removes the exclusion and refetches from page one.

## 2. Filter by staff
- A compact `All Staff` select (person icon) beside the search field, populated from the existing staff overview list already loaded on the page (passed into the feed as a prop alongside `nameOf`).
- Selecting a person scopes the feed query, the KPI strip, and the presence strip to that user only.

## 3. Today's Staff Presence Summary
- Horizontal scroll row of compact cards under the KPI strip: avatar, name, role badge, clock-in time, active hours today, idle duration, and live status dot.
- Status rule from last heartbeat: under 3 min = Online (green), under 20 min = Idle (amber), older/none = Offline (red).
- Data comes from a new read-only RPC over today's `staff_shifts` rows joined to profile name/avatar/role, aggregated per user (earliest clock-in, summed active/idle seconds, latest heartbeat). Admin-only, pharmacy-scoped.

## 4. Feed focused on security & shift intelligence
- Filter chips become: `All`, `High risk`, `Audit`, `Shifts`.
- Shift events are not currently written into the activity log table — only shift rows exist. The `Shifts` view (and shift entries inside `All`) will therefore be derived from today's/paged `staff_shifts` rows and rendered as synthetic "Clocked in / Session on <device>" cards merged into the same time-sorted timeline, so the chip is never empty.
- Everything else keeps the current card design: severity rail colour, badge, relative time, amount.

## Technical notes
- One migration: `get_staff_presence_today()` (security definer, pharmacy-scoped, admin-only, `authenticated` execute only) and an optional `_user_id` argument added to `get_staff_activity_kpis` so KPIs respect the staff filter. No schema changes, no trigger changes.
- All feed changes stay inside `src/components/staff/ActivityFeed.tsx` plus a new `StaffPresenceStrip` component; `StaffManagement.tsx` only passes the staff list down.
- Cursor pagination, search, and grouped date separators stay as they are.
