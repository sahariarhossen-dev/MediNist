# Internal Broadcast Card UI Refactor

## Goal
Redesign the Internal Broadcast composer on `/staff-management` so it is compact, modern, and space-efficient while preserving the existing Supabase targeting backend.

## Current State
- The broadcast card lives inside the Team tab of `src/pages/StaffManagement.tsx`.
- It currently shows a large "Send to" pill-button group (All Staff / Salesmen Only / Managers Only / Specific Person) and a separate search box for picking a specific staff member.
- State already supports `targetType`, `roleTargetValue`, `targetUser`, `targetUserSearch`, and `isUrgent`.

## Changes

### 1. Replace pill buttons with a compact Select dropdown
- Remove the entire pill-button group and its "Send to" label.
- Add a single `Select` dropdown on the left of the bottom toolbar with options:
  - All Staff
  - Salesmen Only
  - Managers Only
  - Specific Person…
- Selecting an option updates `targetType` and `roleTargetValue` exactly as today.

### 2. Compact bottom toolbar
Create one horizontal flex row below the textarea containing:
- **Left:** Target Audience `Select` with a `Users` icon.
- **Middle:** Subtle Urgent toggle/checkbox with a `Zap`/`AlertTriangle` icon and compact label.
- **Right:** Primary `Post` / `Send` button (kept amber, rounded).

### 3. Inline Specific Person picker
- When "Specific Person…" is selected, reveal a second compact staff `Select` directly next to or immediately below the target dropdown.
- Populate it from `pickableStaff` (active, non-self staff), sorted by name.
- On selection, set `targetUser`.

### 4. Card header
Keep the existing "INTERNAL BROADCAST" header but ensure it stays minimalist (icon + uppercase label, no extra decoration).

### 5. Preserve backend logic
- Keep `handleSaveBroadcast`, `fetchBroadcast`, `audienceLabel`, and the `BroadcastRow` interface unchanged.
- Keep active-notice list and badges exactly as today.
- No database or RLS changes.

## Files to edit
- `src/pages/StaffManagement.tsx`

## Verification
- Typecheck passes (`tsgo` or `bunx tsc --noEmit`).
- UI renders: textarea, single target dropdown, urgent toggle, Post button in one compact row.
- Selecting "Specific Person…" reveals the staff picker.
- Posting a notice still writes the correct `target_type`, `target_value`, and `is_urgent` to `pharmacy_broadcasts`.
