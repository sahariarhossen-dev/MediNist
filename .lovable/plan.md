# Remove Security Tab, PIN Lock & Network Restriction

Strips the PIN lock overlay, IP/network restriction and the whole Security tab out of the client, while keeping duty tracking and the Activity (Duty & Fraud Control) tab fully intact.

## Important dependency

`SecurityGate` currently does three things: shift heartbeat tracking, IP guard, and PIN lock. The heartbeat (`useShiftTracker` -> `heartbeat_shift`) is what feeds duty presence and the Activity tab's shift rows, so it must survive. It gets remounted on its own instead of being deleted with the gate.

## Frontend changes

1. `src/components/AppLayout.tsx`
   - Replace `<SecurityGate />` with a new lightweight `<ShiftTracker />` (renders nothing, calls `useShiftTracker()` only).
2. New `src/components/staff/ShiftTracker.tsx` — heartbeat-only mount.
3. Delete:
   - `src/components/security/SecurityGate.tsx`
   - `src/components/security/LockOverlay.tsx`
   - `src/hooks/useScreenLock.ts`
   - `src/hooks/useIpGuard.ts`
   - `src/components/staff/SecurityPanel.tsx`
   - the `src/components/security/` folder once empty
4. `src/pages/StaffManagement.tsx`
   - Remove the `Security` tab trigger and its `TabsContent`, plus the `SecurityPanel` import. Tabs become `Team`, `Invites`, `Activity`; the tab strip widths/grid adjust to the remaining three.
   - If `security` is ever the default/active tab value or arrives via a URL param, fall back to `team`.
5. Keep `src/lib/deviceInfo.ts` (`getSessionId`, `detectDevice`) — still used by the heartbeat.

After the edits: confirm nothing references `LockOverlay`, `useScreenLock`, `useIpGuard`, `SecurityGate` or `SecurityPanel`, and run a TypeScript check.

## Backend / edge function

- Delete the `session-guard` edge function and its `supabase/config.toml` entry — it existed only for IP hashing and the network check.
- **No database drops.** `staff_pins`, `staff_sessions`, `staff_security_settings` and the PIN RPCs stay in place but become unreferenced by the client. Reasons: the security-event audit logging added last week writes `pin_failed` / `session_revoked` style rows and `revoke_staff_session` is referenced by existing log history, and dropping tables is irreversible. They cost nothing while idle.
- Safety switch: set `pin_lock_enabled = false` and `ip_restriction_enabled = false` on every `staff_security_settings` row, so no already-enabled shop can be affected by any stale client.

If you would rather fully drop the three tables and PIN/session functions, say so and that becomes a second migration.

## Untouched

POS billing, inventory, sales, customer ledger, the Activity tab (Duty card, deletion approvals, high-discount approvals, audit/high-risk feed, red flag banner, export) and `ReadOnlyBanner` / remote read-only lock — that is a staff-permission feature, not a PIN feature.

## Verification

- Load `/staff-management` as owner: exactly three tabs, Activity renders unchanged.
- Reload the app and background the tab past the old grace period: no PIN overlay, no network toast.
- Confirm a duty/presence row still updates (heartbeat alive).
