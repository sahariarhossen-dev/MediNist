# Customer Profile Overhaul

Redesign `src/pages/CustomerProfile.tsx` and `src/components/customers/PrescriptionCard.tsx` to deliver a richer identity card, month-aware financial summary, manual due entry, and a more professional prescription vault.

## 1. Customer Identity Card (header)

Replace the current bare name/phone block with a single white card (light grey divider) containing:

- **Name** (bold, larger) + edit pencil icon
- **Phone** with `Phone` icon, tappable `tel:` link
- **Address** row with `MapPin` icon (only shown if present)
- **Notes** row with `FileText` icon, soft grey background, italic small text (only if present)

Back button (`ArrowLeft`) stays at the top, separate from the card.

## 2. Smart Financial Card

Restructure the balance card into two zones:

- **Top row**: Lifetime "Total Due" with large amount (red/green/grey based on sign) — unchanged logic, uses `customer.total_due`.
- **Bottom row** (new "This Month" mini-grid, 2 columns):
  - **This Month's Sales** (red) — sum of `customer_ledger` entries where `entry_type='due'` AND `occurred_at` is in current calendar month.
  - **This Month's Paid** (green) — sum of `entry_type='payment'` for current month.
- Reset behavior is automatic via month filter on the existing ledger array (no DB changes).

**Action buttons** (stacked under the card, full width grid 2 cols):
- `Receive Payment` (existing, green)
- `+ Add Manual Due` (new, amber/orange) — opens a new `AddManualDueSheet`.

### AddManualDueSheet (new component)

`src/components/customers/AddManualDueSheet.tsx`. Mirrors `ReceivePaymentSheet` UX:
- Inputs: Amount (required, >0), Description (optional, defaults to "Manual due entry").
- On save: insert one row into `customer_ledger` with `entry_type='due'`, `customer_id`, `pharmacy_id`, `user_id`, `amount`, `description`. The existing `recalc_customer_total_due` trigger updates `customers.total_due` automatically.
- No mirror cash transaction (manual due ≠ cash movement).
- Toast + reload on success.

## 3. Prescription Vault Restyle

Update `src/components/customers/PrescriptionCard.tsx`:

- White card, `rounded-2xl`, very subtle shadow (`shadow-[0_1px_2px_rgba(0,0,0,0.04)]`), thin left border accent in soft emerald instead of bold blue.
- **Medicine name**: `font-semibold text-[15px] text-gray-900 tracking-tight` (drop heavy bold), pairs with a small strength chip.
- **Dosage as pill badges**: parse `dosage_frequency` (e.g. `1+0+1`) into 3 small rounded badges (morning/noon/night) with subtle color tints — amber, sky, indigo backgrounds at 10% opacity. Fallback to a single mono badge if parsing fails (non `n+n+n` patterns).
- **Timing**: small italic tag with soft grey background (`bg-gray-50 text-gray-500 italic text-[11px]`), e.g. *"Before meal"*.
- **Notes**: light italic grey small text below.
- **Action menu**: discreet `MoreVertical` — smaller (w-3.5 h-3.5), muted, hover-only background.
- Selection ring/checkbox behavior preserved.

## 4. Data Logic

- Month filter uses local `new Date().getFullYear()/getMonth()` against ledger `occurred_at` (already fetched).
- No schema changes, no migrations. All RLS policies already allow members to insert ledger entries.

## 5. Files Touched

| File | Change |
|------|--------|
| `src/pages/CustomerProfile.tsx` | Identity card, financial card with monthly stats, new manual-due button & sheet wiring |
| `src/components/customers/PrescriptionCard.tsx` | Restyle: dosage pill badges, italic timing tag, refined typography |
| `src/components/customers/AddManualDueSheet.tsx` | **New** sheet for manual due entry |

No DB migrations. No edge functions. Lucide icons already available (`MapPin`, `FileText`, `Plus`, `MinusCircle`).
