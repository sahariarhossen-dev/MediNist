## Goal
Eliminate floating-point display bugs (e.g., `90.14999999999999`) and ensure all money values are computed, stored, and displayed with exactly 2 decimal places.

## Approach

### 1. New money helpers in `src/lib/formatUtils.ts`
Add two small utilities used everywhere money is touched:

- `roundMoney(n: number): number` → `Math.round((n + Number.EPSILON) * 100) / 100`  
  Use for any value that goes into state, math, or the database.
- `formatMoney(n: number): string` → `roundMoney(n).toFixed(2)`  
  Use for any value rendered in the UI.

Using `Number.EPSILON` avoids edge cases like `1.005` rounding down.

### 2. Fix calculations in `src/pages/CreateSale.tsx`
Replace the existing `Math.round(...)` (which truncates to integers, losing paisa) with `roundMoney(...)`:

- `getLineTotal` — wholesale branch and retail branch both wrapped in `roundMoney`.
- `subtotal` reducer → `roundMoney`.
- `wholesaleNetTotal` reducer → `roundMoney`.
- `discountAmount` → `roundMoney(subtotal * discountPercent / 100)`.
- `retailNetTotal` → `roundMoney(subtotal - discountAmount)`.
- `totalDiscountAmount` → `roundMoney(...)`.

### 3. Fix display in `src/pages/CreateSale.tsx`
Replace every raw money render with `formatMoney(...)`:

- Cart item collapsed card: `grossTotal`, `lineTotal`, `unitPrice`.
- Cart item expanded card: MRP, the `qty * price = total` line, and the wholesale calc string `unitPrice × qty = gross - disc% = lineTotal`.
- Search dropdown price.
- Summary section: each line in the `Subtotal` breakdown (`{c.quantity * (c.medicine.price || 0)}`), the `subtotal` total, retail `discountAmount`, wholesale `totalDiscountAmount`, and `netTotal`.

### 4. Fix DB writes in `saveSale` (`CreateSale.tsx`)
Wrap values in the `salePayload` and `sale_items` insert with `roundMoney`:
- `subtotal`, `discount_amount`, `total` on the sale row.
- `unit_price`, `total_price` on each sale_item.
- The `paid` and `dueAmt` values in the customer ledger / cash transaction inserts.

### 5. Fix invoice display in `src/pages/Invoice.tsx`
Currently uses `Number(...).toLocaleString()` which drops decimals. Switch to `formatMoney(...)` (keeping comma grouping where appropriate via `toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })` inside `formatMoney`):

- Per-row `unit_price` and `total_price`.
- Summary: `subtotal`, `discount_amount`, `subtotalLessDiscount`, `total`.

### 6. Sweep other obvious money render points
Quick check for `.toLocaleString()` / raw `৳{...}` on currency in:
- `Sales.tsx`, `AllTransactions.tsx`, `DailyTransactions.tsx`, `CustomerProfile.tsx`, `Customers.tsx`, `Index.tsx`.

Apply `formatMoney` where a money value is rendered. (Quantity / count fields stay untouched.)

## Out of scope
- DB schema changes — `numeric` columns already preserve precision; we just stop sending noisy floats.
- Currency symbol or locale changes.
- Per-user rounding rules (kept at 2 decimals globally).
