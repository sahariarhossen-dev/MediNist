

## Multi-select for Prescription Vault & Sales search

Let pharmacists batch-pick items in two places: tick multiple prescriptions in the Vault and push them all to the Sales page in one go, and tick multiple search results on the Sales page before adding them to the cart together.

### 1. Prescription Vault — multi-select UI (`CustomerProfile.tsx` + `PrescriptionCard.tsx`)

- Add `selectedIds: Set<string>` state in `CustomerProfile`'s vault tab.
- **`PrescriptionCard`**: replace the per-card "Add to Sale" button with a left-aligned `Checkbox` (`@/components/ui/checkbox`). Tapping anywhere on the card body toggles the checkbox; checked state gets a blue ring (`ring-2 ring-blue-500`) and `bg-blue-50/40`. Edit / Delete remain in the kebab menu. Props change from `onAddToSale` → `selected: boolean` + `onToggleSelect()`.
- **Vault tab header row**: add a "Select all" toggle (a `Checkbox` + label, indeterminate when partial). Clicking flips between all / none.
- **Floating action bar**: when `selectedIds.size > 0`, render a fixed bar above the bottom safe area:
  - `mx-page bottom-4 fixed` pill bar, blue gradient, label `Add Selected (N) to Sale`
  - On tap → navigate to `/create-sale?customer=<id>&prescribe=<id1>,<id2>,…` (comma-separated list of prescription ids)
- Empty state and "Add Prescription" button stay as-is.

### 2. Sales page — accept multiple `prescribe` ids (`CreateSale.tsx`)

- Update the `?prescribe=` URL effect to split on `,`. Loop through each id, look up the matching prescription, and call `addPrescriptionToCart` sequentially so all prescribed meds land in the cart on arrival. Existing single-id usage keeps working (a single id is just a one-element list).
- Single-tap chips in the "Saved for {customer}" strip remain unchanged (still adds one med at a time).

### 3. Sales page — multi-select search results (`CreateSale.tsx`)

The search dropdown currently calls `addToCart(med)` on click and immediately closes. New behavior:

- Add `pendingSelection: Map<string, Medicine>` state (keyed by medicine id).
- Each result row becomes a `<button>` that **toggles** membership in `pendingSelection` instead of immediately adding to cart. Tapping doesn't clear the search query or close the dropdown.
- Visual checked state: when in `pendingSelection`, the row gets a blue background (`bg-blue-50`), a blue check icon on the right, and the pill icon turns blue. Unchecked rows render as today.
- **Confirm bar inside the dropdown**: when `pendingSelection.size > 0`, render a sticky bottom row inside the dropdown card:
  - Left: `N selected`
  - Right: `Confirm` button (emerald) and a small `Clear` link
  - On `Confirm` → push every pending medicine through the existing add-to-cart logic (skipping any already in cart, applying default discount for wholesale just like `addToCart` does), then clear `pendingSelection`, clear `searchQuery`, and close the dropdown. Expand the first newly added item.
- Pressing the search `X` also clears `pendingSelection`.

### 4. State preservation across navigation

The deep-link contract (`/create-sale?customer=<id>&prescribe=<id1>,<id2>,…`) is the single source of truth — it survives full route change, refresh, and back-nav, so no extra cross-page store is needed. The Sales page already pre-selects the customer and loads prescriptions from this URL.

### 5. Visual / accessibility

- Reuse existing `Checkbox`, color tokens, and `mx-page` paddings — no new design system.
- Floating "Add Selected" bar uses `text-fluid-sm font-semibold`, blue (`bg-blue-600 hover:bg-blue-700`), with subtle shadow (`shadow-lg`).
- Search-result checked state passes a11y: `aria-pressed={selected}` on the row button.

### 6. Files

- **Edit**: `src/pages/CustomerProfile.tsx` (vault tab logic + select-all + floating bar), `src/components/customers/PrescriptionCard.tsx` (checkbox prop, remove Add-to-Sale button), `src/pages/CreateSale.tsx` (multi-prescribe URL parsing + multi-select search dropdown + confirm bar).
- **Unchanged**: database schema, RLS, routes, manifest, every other page, and the existing single-chip prescription strip.

