# Persistent Prescription Header on Sales Page

Optimize `src/pages/CreateSale.tsx` so a selected customer's prescription chips stay visible after items enter the cart, and the bulky customer card collapses to free vertical space.

## Changes

### 1. `src/pages/CreateSale.tsx` — Conditional rendering

**Customer area (currently around line 550–560):**
- When `cartItems.length === 0`: render the existing full `CustomerPickerPopover` trigger (unchanged).
- When `cartItems.length > 0` AND `selectedCustomer`: replace it with a compact inline row:
  - Text: `Billing for: <strong>{selectedCustomer.name}</strong>`
  - Small ghost button (`X` icon) to clear the customer (calls `setSelectedCustomer(null)`).
  - Small "Change" link that opens the picker (reuse the popover, just trigger styled as a tiny chip).
  - Tailwind: `flex items-center justify-between text-[12px] text-gray-600 bg-gray-50 border border-gray-100 rounded-lg px-3 py-1.5`.

**Prescription strip (currently line 563):**
- Change condition from
  `selectedCustomer && prescriptions.length > 0 && cartItems.length === 0 && !searchQuery`
  to
  `selectedCustomer && prescriptions.length > 0`.
- Strip stays mounted regardless of cart state or search query so the user can keep one-tap adding meds.
- Header text stays "Saved for {name}".
- Container: keep `flex gap-2 overflow-x-auto pb-1 -mx-1 px-1`, add `scroll-smooth snap-x` for smooth swipe.

**Per-chip "already in cart" feedback:**
- Compute `const cartMedicineIds = new Set(cartItems.map(i => i.medicine.id))` once per render.
- For each prescription chip, check `presc.medicine_id && cartMedicineIds.has(presc.medicine_id)`.
- When in cart: swap classes from blue (`border-blue-200 bg-blue-50 text-blue-700`) to green (`border-emerald-200 bg-emerald-50 text-emerald-700`) and prepend a `Check` icon (lucide `Check`, `w-3 h-3`) instead of the `Pill` icon. Keep button enabled (tapping again increments quantity via existing `addPrescriptionToCart`).

### 2. State management
No new state required. `prescriptions` is already loaded on customer change (lines 184–197) and only cleared when `selectedCustomer` becomes null. That naturally satisfies "stays as long as a customer is selected". No effect changes needed.

### 3. Out of scope
- No DB changes.
- No changes to `addPrescriptionToCart` logic (quantity/dosage handling already correct).
- No changes to other pages.

## Files touched
- `src/pages/CreateSale.tsx` (only)

## Visual summary

```text
Cart empty:                          Cart has items:
[ Search bar............. ]          [ Search bar............. ]
[ + Select Customer card ]           [ Billing for: Rahim  · change · x ]
Saved for Rahim                      Saved for Rahim
[Pill Napa 1+0+1] [Pill Elodep 0+0+1]   [✓ Napa 1+0+1] [Pill Elodep 0+0+1]
(empty cart placeholder)             1. Napa  x2 ...
                                     2. ...
```
