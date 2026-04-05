## Plan: Redesign Invoice Header — 6-Row Left Column + Vertical Divider + Aligned Right Column

### What changes

**File: `src/pages/Invoice.tsx**` (lines 147–173)

Replace the current two-column header with a new structure:

**Left Column (6 rows, left-aligned):**

1. Shop Name — `text-xl font-extrabold`
2. Proprietor — `text-sm` → `Pro- {pharmacy.proprietor_name}`
3. Mobile — `text-sm` → `Mob-{profile.phone}`
4. Local Location — `text-sm` → `{pharmacy.address}` (e.g., "Notun Hat More")
5. Area/District — `text-sm` → `{pharmacy.upazila} - {pharmacy.district}` (e.g., "Ishwordi - Pabna")
6. Email — `text-sm` → `Email- {pharmacy.email}`

**Middle Divider:**

- A vertical border (`border-r border-gray-300`) at 50% height of the header, using `self-center h-[50%]` or a dedicated `div` with fixed height, providing clean visual separation.

**Right Column (6 rows, left-aligned within right column):**

1. Icon + "INVOICE" (bold, red, uppercase)
2. "Transaction Confirm By" (small gray text)
3. Sale type (Retail/Wholesale)
4. Seller name
5. Invoice ID
6. Timestamp `Dkh-{HH:mm}/{dd-MM-yy}`

**Data cleanup:**

- Remove the `fullAddress` concatenation (line 124-125) that joins address+upazila+district into one string
- Split address into separate Row 4 (address) and Row 5 (upazila - district)
- Consistent `leading-6` or `leading-relaxed` on all rows for pixel-perfect line-height alignment

### Layout structure (ASCII)

```text
┌─────────────────────────┬──┬─────────────────────────┐
│ Nasser Madical Hall     │  │               📄 INVOIC │
│ Pro- Nasir Uddin        │  │  Transaction Confirm BY │
│ Mob-013154282           │||│                  Retail │
│ Notun Hat More          │  │            Mehedi Hasan │
│ Ishwordi - Pabna        │  │         INV-kd409524cfw │
│ Email- nasir@gmail.com  │  │      Dkh-11:05/04-05-26 │
└─────────────────────────┴──┴─────────────────────────┘
═══════════════ RED DIVIDER ═══════════════════════════
```

### Files affected

- `src/pages/Invoice.tsx` — header section rewrite (lines ~124–173)