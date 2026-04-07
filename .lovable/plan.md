

## Plan: Expandable Shop Profile + Global Default Discount

### Overview
Refactor ShopProfile into accordion-style collapsible sections, add phone/email fields to shop info, and add a new "Default Discount Settings" section that persists to the database and is consumed by CreateSale.

### 1. Database Migration

Add two new columns to `pharmacies`:
```sql
ALTER TABLE pharmacies
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS default_discount numeric DEFAULT 10;
```

The `email` column already exists on pharmacies.

### 2. ShopProfile.tsx — Full Rewrite

**Accordion UI:**
- Import `Accordion, AccordionItem, AccordionTrigger, AccordionContent` from `@/components/ui/accordion`
- Wrap each section (Shop Info, Staff, Billing, Discount) in an `AccordionItem` inside a single `Accordion` with `type="multiple"`
- Each item gets the `rounded-3xl` card styling with emerald border
- Icons: `Store`, `Users`, `FileText`, `Percent` next to each section title

**Shop Information fields (expanded):**
- Pharmacy Name, Proprietor Name, Shop Mobile Number (new), Shop Email Address (existing `email` col), Drug License No, Trade License No, Address
- Update `editForm` state and `handleSaveInfo` to include `phone` and `email`

**Staff Management:** Same content, just inside accordion

**Billing Customization:** Same content, just inside accordion

**New section — Default Discount Settings:**
- State: `defaultDiscount` loaded from `pharmacy.default_discount`
- Input field for percentage (0-100), validated
- Save button updates `pharmacies.default_discount`
- Description text: "This discount will auto-apply to every new sale. Staff can override it per transaction."

### 3. CreateSale.tsx — Consume Global Discount

- On mount, fetch `default_discount` from the user's pharmacy record
- Use it as the initial value for `discountPercent` state instead of hardcoded `10`
- Remove `const DEFAULT_DISCOUNT_PERCENT = 10` and replace with the fetched value
- The existing manual edit icon still allows per-sale overrides

### Files Modified
- `supabase/migrations/` — new migration (phone + default_discount columns)
- `src/pages/ShopProfile.tsx` — accordion UI, new fields, discount section
- `src/pages/CreateSale.tsx` — fetch default discount from pharmacy on mount

### Technical Details
- Accordion component already exists at `src/components/ui/accordion.tsx`
- `pharmacies` table already has an `email` column per schema
- The `default_discount` defaults to `10` so existing behavior is preserved

