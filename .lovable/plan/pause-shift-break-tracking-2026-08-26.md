# Pause Shift / Break Tracking

Add a break workflow to Duty Management in `/staff-management` so owners can track how long staff are away from the shop, with break time deducted from worked hours.

## 1. Shift states in the duty card

Three states for the selected staff member:

- **Off Duty** (gray) — `Start Shift` button only.
- **On Duty** (green) — "On duty since HH:MM", buttons `Take Break` and `Stop Shift`.
- **On Break** (amber) — "On break since HH:MM", buttons `Resume Duty` (primary) and `Stop Shift`.

Buttons disable while a request is in flight; each action refreshes the duty summary, approval queue and activity feed the way Start/Stop already does.

## 2. Metrics

- Daily metrics bar gains a `BREAK TODAY` counter next to `DUTY TODAY`.
- Monthly card gains `TOTAL BREAK` beside `HOURS WORKED`.
- `DUTY TODAY` and `HOURS WORKED` become net of breaks (worked = elapsed shift time minus break seconds, floored at 0), so existing numbers only shrink by real break time and stay accurate for staff who never take breaks.
- An open break keeps accruing live: unfinished break time is counted from `current_break_started_at` up to now.

## 3. Database and RPCs

New columns on `staff_shifts`: `break_seconds int not null default 0` and `current_break_started_at timestamptz`.

New owner/manager-only functions (same permission and pharmacy checks as `admin_start_shift`):

- `admin_pause_shift(_user_id)` — sets `current_break_started_at = now()` on the open shift; no-op if already on break or no open shift.
- `admin_resume_shift(_user_id)` — adds the elapsed break into `break_seconds`, clears `current_break_started_at`, and logs `"Resumed duty after 30m break"`.

Both write a `staff_activity_logs` row with `severity = 'shift'` (action types `shift_pause` / `shift_resume`), so the existing `Shifts` filter chip picks them up with no feed changes.

`admin_stop_shift` also closes an open break first, so a shift can never end mid-break and leave break time uncounted.

`get_staff_duty_summary` returns the new fields: `break_seconds_today`, `break_seconds_month`, `on_break`, `break_started_at`, and the existing `duty_seconds_today` / `duty_seconds_month` become net-of-break values.

## Technical notes

- One migration: two columns, two new SECURITY DEFINER functions with `EXECUTE` granted to `authenticated` only, plus replacements for `admin_stop_shift` and `get_staff_duty_summary`.
- Frontend: `DutyCard.tsx` (state machine + break metric), `MonthlySummaryCard.tsx` (total break cell), and the `DutySummary` type extended with the new fields. `DutyControlCenter.tsx` needs no change beyond passing through the refreshed summary.
- `heartbeat_shift` and `get_staff_presence_today` stay untouched; the 12-hour per-shift cap in the summary query stays in place.
