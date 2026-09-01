# Chats Workspace — Premium Redesign & Filter Cleanup

Visual and structural overhaul of the Chats screen. Routing (`/workspace/ai/:conversationId`, `/workspace/room/:roomId`), hooks, and edge functions stay untouched.

## 1. Filters

New pill set, exactly four: `All`, `Unread`, `MediNist AI`, `Shop Messages`.

- `Unread` shows AI threads with an unseen assistant reply plus staff rooms with `unread_count > 0` (muted threads excluded from the count, same rule as the badge).
- `System Alerts` filter and the amber System Alerts inbox row are removed from this screen. The `/workspace/alerts` route and `AlertsThread` stay in place so nothing breaks; urgent broadcasts still surface via the existing banner.
- Pills get an emerald-tinted active state (soft emerald surface, emerald text, hairline border) instead of the solid slate chip, with an inline count badge on `Unread`.

## 2. Dummy row cleanup

Checked the database: there is no seeded or hardcoded group row. All existing conversations are real 1:1 staff rooms; the "Teammate" label you see is a fallback used when the other member's profile has no `full_name`, so an empty-named real teammate renders as a generic grey row.

Fix, presentation-only:

- Replace the generic fallback with the teammate's role label (e.g. "Pharmacy staff") when no name exists, so it never looks like a placeholder row.
- Hide rooms that have no messages and no resolvable counterpart, so only real conversations render.
- Groups continue to appear only when the user creates one — no default group is rendered.

## 3. Visual system

Colors go through semantic/brand tokens (emerald-teal MediNist palette), not ad-hoc greys.

- **Shell**: soft neutral canvas, white list surface with rounded card grouping and hairline dividers, generous 14–16px row padding.
- **Search bar**: pill-shaped input, crisp icon, subtle inner shadow, emerald focus ring, clear button when text is present.
- **Rows / typography**: unread titles semibold with emerald timestamp and emerald pill badge; read rows medium title with muted, truncated preview; precise relative timestamps.
- **Avatars**:
  - AI threads — sparkle-style topic icon on a subtle emerald/teal gradient with a soft outer ring and glow while "Thinking…".
  - Staff — image avatar or crisp initials badge with an emerald online / amber away status dot ringed in the surface color.
- **Floating button**: emerald gradient, layered elevation, scale-and-lift on press, subtle ring on hover; safe-area aware.
- **Empty states**: centered minimal icon composition (concentric emerald-tinted rings) with distinct copy per filter and a direct "Start a chat" / "New AI topic" action.

## 4. Technical notes

- `src/pages/Workspace.tsx` — filter model becomes `all | unread | ai | staff`; alerts row/filter removed; unread predicates centralized; new header, search, pills, list container, empty state, FAB.
- `src/components/workspace/AiThreadRow.tsx` — emerald/teal avatar treatment, tightened typography, unchanged long-press menu behavior.
- `src/components/messaging/InboxRow.tsx` — matching typography/status-dot polish and the role-based name fallback.
- `src/index.css` — add emerald brand surface/ring tokens if needed for the new states.
- No schema changes, no hook signature changes, no edge function changes.
