# Merge Product Targets Into Monthly Target Card

Fold the standalone "Product Targets" card into the existing "Monthly Target" card so staff see one unified Goals block: monthly sales gauge → product targets → achievements. Switch the per-product UI from large bordered cards to compact horizontal rows.

## 1. Redesign `ProductTargetsList.tsx` as compact rows

Rewrite the component so it can be embedded inside another card (no more outer white wrapper) and renders compact rows.

New props:
- `embedded?: boolean` — when true, drop the outer card chrome and header (host card supplies them).
- Existing props kept: `pharmacyId`, `userId`, `isAdmin`, `currentUserId`, `hideWhenEmpty`.
- Add `onAddRequest?: () => void` so the host can drive the Add button (used when admin's pencil is on the parent card).

Row layout (per target):
```
[icon] Napa Extend           15/30 packs   🎁 ৳200
       ▓▓▓▓▓▓░░░░░░░░░░░ (thin 1.5px bar)
```
- Pill icon in tinted circle (sky in progress, emerald achieved).
- Name truncates; quantity `X/Y` in tabular-nums on the right.
- Incentive badge: amber pill `🎁 {incentive_description}` (text/emoji together).
- Thin progress bar (`h-1.5`), blue (`bg-blue-500`) → emerald (`bg-emerald-500`) when achieved.
- Achieved state: row gets `bg-emerald-50/60` background + check icon; replace incentive badge with green `✓ Achieved 🏆` badge.
- Admin-only trash icon, smaller and right-aligned, hidden until row hover on desktop.

Responsiveness:
- Wrap rows in a container that becomes scrollable when more than 3 targets:
  ```
  <div className="space-y-2 max-h-[180px] overflow-y-auto pr-1
                  [scrollbar-width:thin]">
  ```
- Each row roughly 52px → 3 rows ≈ 160px cap.

Empty/loading/non-embedded behavior unchanged. When `embedded` and empty + admin, show inline "No product targets yet — tap + to add one." When `embedded` and empty + staff, render nothing (so host can hide the section divider).

## 2. `Profile.tsx` — embed inside Monthly Target card

Remove the separate "My Product Targets" block (the one added previously between Monthly Target and Achievements).

Inside the Monthly Target `<Card>`, after the existing `flex items-center gap-5` row that holds `<CircularProgress />` + target/achievement text, add:

```
{/* Divider only when there are targets */}
<ProductTargetsList
  pharmacyId={profile.pharmacy_id}
  userId={user.id}
  isAdmin={false}
  embedded
  hideWhenEmpty
  /* internally renders: thin border-t separator + label "Product Targets · This month" + rows */
/>
```

The component, when `embedded`, prepends its own `border-t border-border mt-4 pt-3` separator and a small section label, so the Monthly Target card visually splits into "Overall" (top) and "Per-product" (bottom).

## 3. `StaffPerformanceDetails.tsx` — embed + admin pencil controls add

Remove the standalone "Product Targets" card block currently inserted between Achievements and Earnings.

Inside the existing "Monthly Target" card (the white rounded-3xl with the circular progress), add an embedded list below the gauge row, just like Profile.

Admin edit affordance:
- The card already shows a pencil icon when `canEdit && editing !== "target"`. Keep its existing job (edit the ৳ monthly target) but add a second small `+` button beside it labeled "Add product target" that calls the embedded list's `onAddRequest`.
- To wire that, lift the `addOpen` state up: `StaffPerformanceDetails` owns it, passes `onAddRequest={() => setAddOpen(true)}` to the embedded list, and the list always mounts the `AddProductTargetSheet` with a controlled `open` prop coming from the parent.
  - Simpler alt: keep Add button inside the embedded list itself, render it next to the section label (admin-only). The pencil stays for monthly target editing only. **Use this simpler path** — matches the requirement "Admin can click Edit (pencil) icon … to add or modify these specific product goals" by making the Add control visible right inside the same card.

## 4. Data & sync

No new queries — `ProductTargetsList` already filters by current month via `target_month = firstOfMonth()`, matching the monthly sales window. Auto-increment trigger from the previous step continues to update progress on every completed sale.

## 5. Files touched

- `src/components/staff/ProductTargetsList.tsx` — major rewrite to compact rows + `embedded` prop + scroll cap.
- `src/pages/Profile.tsx` — remove standalone block; nest `<ProductTargetsList embedded hideWhenEmpty />` inside Monthly Target card.
- `src/pages/StaffPerformanceDetails.tsx` — remove standalone block; nest `<ProductTargetsList embedded />` (admin sees empty state + Add button) inside Monthly Target card.

No DB or trigger changes. No new component files.

## Out of scope

- Editing an existing target inline (still delete + re-add for now).
- Carrying targets across months / archiving.
