# Security Tab Redesign — Assessment & Proposal

## 1. Assessment of your 4-step plan

All four steps are right, and step 1 is the single biggest win. Notes per step:

- **Human-readable Wi-Fi (step 1)** — agreed, but this needs a small data change. Today `staff_security_settings.allowed_ip_hashes` is a plain `text[]`, so there is nowhere to store a name like "Main Counter Network". We should move to a labelled shape (a `jsonb` list of `{hash, label, added_at, added_by}`) and migrate existing hashes in with an auto label ("Shop network 1"). Hashes then never appear in the UI at all.
- **Health summary banner (step 2)** — agreed. Make it computed, not decorative: one score derived from real signals (PIN lock on, at least one network bound, no stale/unknown devices, no recent security red flags). If it can be "Protected" while something is actually open, owners stop trusting it.
- **Card layout + microcopy (step 3)** — agreed. Each card gets a plain "why" line and, importantly, a "what happens to my staff" line, since these toggles can lock people out. The current copy explains the mechanism, not the consequence.
- **Visual devices + remote sign-out (step 4)** — agreed, with one guardrail: remote sign-out should confirm before firing ("Sign out Rakib's phone? He'll need to log in again."), and show the device's last-seen shift context so the owner isn't kicking someone mid-sale.

One risk to fix while we're here: turning on network restriction with zero networks added currently silently allows everyone (the edge function treats an empty list as "allow all"). The UI should never present that state as protected — it should read "Not active yet — add this network".

## 2. Recommended additions (with business value)

1. **Guided "Lock down my shop" setup (2 taps)** — one button that enables PIN lock, adds the current Wi-Fi as "Shop Wi-Fi", and shows a summary. *Why:* security features die from setup friction; owners who never finish setup get zero protection. This converts the tab from a settings screen into an outcome.
2. **Per-staff PIN status list** — who has a PIN set, who is currently locked out from failed attempts, and a "Reset PIN" action. *Why:* today the owner has no way to see or fix a staff member stuck at the lock screen, so the first lockout becomes a support call and the feature gets switched off.
3. **Recent security events strip (last 7 days)** — 3-5 latest `security`/`high_risk` rows already being logged (failed PINs, blocked network attempts, remote sign-outs), with "See all" jumping into the Activity tab's Security filter. *Why:* proof the protection is working. Without visible output, owners assume nothing is happening and disable it.
4. **Unknown-device / new-network alert** — when a device signs in from a network that is not on the allowed list (even while restriction is off, in "watch" mode), surface it as a card the owner can either approve as a new network or sign out. *Why:* this catches the real-world case — a staff member using the POS from home — without requiring the owner to pre-configure anything.
5. **Stale device cleanup** — group devices not seen in 14+ days under "Old devices" with a single "Sign out all old devices" action. *Why:* the list grows with every phone and browser; a long list makes anomalies invisible.

Deliberately *not* recommending: 2FA/OTP on staff login (adds daily friction for counter staff for little gain here), geofencing (unreliable indoors and battery-hostile), and per-device permission overrides (duplicates the existing staff permission model).

## 3. Proposed structure of the redesigned tab

```text
┌──────────────────────────────────────────┐
│ Security status: Protected               │  computed banner
│ PIN lock on · 1 network bound · 3 devices│
│ [Fix: add this network]  (when needed)   │
└──────────────────────────────────────────┘
  Screen PIN lock          [card, toggle, grace period]
  Shop network             [card, toggle, named badges]
  Staff PIN status         [list: set / locked out / reset]
  Active devices           [device cards, Sign out]
  Old devices (2)          [collapsed, bulk sign-out]
  Recent security events   [3 rows → Activity/Security]
```

## 4. Technical notes

- **Migration:** add `allowed_networks jsonb default '[]'` to `staff_security_settings`, backfill from `allowed_ip_hashes` with generated labels, keep the old column readable during transition; update the `session-guard` edge function to read hashes out of the new shape. Empty-list semantics change from "allow all" to "restriction not yet active" (surfaced in the UI, not silently permissive).
- **PIN status:** needs a new owner-only `SECURITY DEFINER` RPC returning `{user_id, has_pin, locked_until}` from `staff_pins` — never the hash.
- **Unknown-device detection:** compare `staff_sessions.ip_hash` (already stored) against the allowed list client-side for the owner; no new writes needed.
- **Security events strip:** reads `staff_activity_logs` filtered to `severity in ('security','high_risk')` — all these events are already being written by the audit work just shipped.
- **Frontend:** split `SecurityPanel.tsx` into `SecurityStatusBanner`, `PinLockCard`, `ShopNetworkCard`, `StaffPinStatusList`, `DeviceList`, `SecurityEventsStrip`. Semantic tokens only, no raw hashes rendered anywhere.
- No changes to POS, inventory or billing paths.

## 5. Suggested build order

1. Migration + `session-guard` update + PIN status RPC.
2. Banner, PIN card, network card with named badges.
3. Device list rework (confirm dialog, old-device grouping, unknown-device alert).
4. Staff PIN status list + security events strip + guided setup button.
