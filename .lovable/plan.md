

## Smart Customer Vault — CRM, Credit Ledger & Prescription Vault

A new "Customers" hub inside More: searchable directory, profile with **Ledger** + **Prescription Vault** tabs, and full sync with the Sales/Checkout flow so credit sales auto-post to the customer's ledger and saved prescriptions auto-suggest during billing.

### 1. Database (Supabase migration)

Three new tables, all scoped to `pharmacy_id` with RLS following the existing `cash_transactions` pattern (members can read/write within their pharmacy, admins can delete).

**`customers`**
- `id uuid pk`, `pharmacy_id uuid not null`, `name text not null`, `phone text`, `address text`
- `total_due numeric not null default 0` (denormalized running balance for fast list display)
- `notes text`, `created_at`, `updated_at`
- Index: `(pharmacy_id, name)`, `(pharmacy_id, phone)`
- Unique partial index on `(pharmacy_id, phone)` where phone is not null (prevents dupes; "Quick Add" reuses if phone matches)

**`customer_ledger`**
- `id`, `customer_id uuid not null`, `pharmacy_id uuid not null`, `user_id uuid not null`
- `entry_type text not null check in ('due','payment')` — 'due' = credit sale (red, increases balance), 'payment' = customer paid (green, decreases balance)
- `amount numeric not null` (always positive, sign comes from `entry_type`)
- `description text`, `sale_id uuid` (nullable, links to `sales.id` when posted from checkout)
- `occurred_at timestamptz default now()`, `created_at`

**`customer_prescriptions`**
- `id`, `customer_id`, `pharmacy_id`
- `medicine_id uuid` (nullable — falls back to free-text), `medicine_name text not null`, `strength text`
- `dosage_frequency text not null` (e.g. `1+0+1`), `dosage_timing text` (e.g. "after meal"), `notes text`
- `created_at`

**Trigger `customer_ledger_recalc_total`** (after insert/update/delete on `customer_ledger`):
recompute `customers.total_due = SUM(due) - SUM(payment)` for the affected `customer_id`. Keeps the directory list fast and accurate.

**Note on existing `customer_dues`**: that table stays as-is (legacy invoice-level dues used by `DailyTransactions`) — not deleted, not modified. The new `customer_ledger` is the source of truth for the CRM. The Daily Transactions "Today's Due" card will switch to summing `customer_ledger` entries with `entry_type='due'` for the day so old and new flows stay consistent. (No data migration needed since `customer_dues` is empty.)

### 2. Routes & navigation

- New route `/more/customers` → `CustomersList` page
- New route `/more/customers/:id` → `CustomerProfile` page (with internal Tabs)
- Add "Customers" entry to the menu in `src/pages/More.tsx` (icon: `Users`, color `text-purple-600`), placed above "Daily Transactions"

### 3. Customer Directory (`src/pages/Customers.tsx`)

Mobile-first list (matching `More`/`DailyTransactions` style):
- AppHeader + back chevron + title "Customers"
- Sticky search input — debounced, queries `customers` filtered by `ilike name` OR `ilike phone` within pharmacy
- "Quick Add" floating + button (bottom-right, same FAB style as DailyTransactions)
- Each row card: avatar initials, name, phone, and right-aligned `Total Due` chip
  - Due > 0 → red background pill (`bg-red-50 text-red-600`)
  - Due == 0 → muted "Settled" pill
  - Due < 0 (advance) → green pill (`bg-green-50 text-green-700`)
- Tap row → navigate to `/more/customers/:id`

**Quick Add sheet** (reuses `Sheet` like `LogTransactionSheet`): name (required), phone, address. On save, insert into `customers`. If phone collides with existing customer in same pharmacy, reuse it and navigate to that profile.

### 4. Customer Profile (`src/pages/CustomerProfile.tsx`)

Header: back arrow + customer name + phone, plus an edit pencil opening the same Quick Add sheet in edit mode.

**Balance Card** (top, full-width):
- Big "Total Due" amount, colored red if > 0, green if customer is in advance, gray if settled
- Sub-row: small `Sales (due)` total in red + `Payments` total in green
- Right side: "Receive Payment" primary button → opens a sheet to log a `payment` ledger entry (amount + optional note). On save, also writes a matching `cash_transactions` row with `direction='in'`, `category='due_collection'`, `party_name=<customer name>` so it shows up in Daily Transactions exactly like today.

**Tabs** (`@/components/ui/tabs`): `Ledger` | `Prescription Vault`

**Ledger tab — vertical timeline**
- Reverse-chronological list of `customer_ledger` rows
- Each item: left-side colored dot on a vertical line (red for `due`, green for `payment`), date/time, description, sale link chevron if `sale_id` present (tap → `/invoice/:saleId`)
- Right-side amount: red `+৳X` for due, green `−৳X` for payment
- Empty state: "No transactions yet"

**Prescription Vault tab**
- "Add Prescription" button at top → sheet with: medicine search (reuses the same `medicines` typeahead from `CreateSale`), strength (auto-filled from `product_size` if found, editable), dosage frequency (text input with helper text "e.g. 1+0+1"), dosage timing (select: Before meal / After meal / With meal / As needed), free-text notes
- List of cards, large-text and high-contrast for quick reading at the counter:
  - Bold medicine name + strength badge
  - Big monospaced `1+0+1` chip + timing label
  - Right side: "Add to Sale" button → navigates to `/create-sale?customer=<id>&prescribe=<presId>` (CreateSale picks it up, see §5)
  - Trailing kebab menu: Edit / Delete

### 5. Sales / Checkout integration (`src/pages/CreateSale.tsx`)

**Customer picker** — new compact selector at the top of the cart area (under the search bar, above the cart):
- Pill button "Walk-in customer" (default) → opens a popover with: search field over `customers`, "+ Quick Add" inline link, and a clear "Walk-in" option
- Selected state shows name + phone in the pill, with an `X` to clear
- URL `?customer=<id>` pre-selects on load (used by the "Add to Sale" deep-link from the Prescription Vault)

**Prescription suggestions** — when a customer is selected and the cart search is empty, render a "Saved for {name}" strip above the empty-cart hint:
- Horizontal scroll row of small chips, each = one prescription (medicine name + dosage)
- Tap chip → adds that medicine to the cart at qty 1 (resolves by `medicine_id` if set, else by name lookup in current pharmacy's `medicines`)
- Deep-link `?prescribe=<presId>` auto-adds that single prescription on load

**Payment method on Complete** — replace the single "Complete Sale" button with a small payment-method choice that appears only when a customer is selected:
- Segmented control: `Cash` (default) | `Due` | `Split`
- `Cash`: existing flow unchanged
- `Due`: on save, after creating the `sales` row, also insert a `customer_ledger` row `{customer_id, entry_type:'due', amount: netTotal, sale_id, description: 'Sale #<short id>'}`. Trigger updates `customers.total_due`. No `cash_transactions` row is written for the due portion (it's not cash).
- `Split`: numeric input for "Paid now" (≤ netTotal). Writes both: a `customer_ledger` 'due' row for the remainder + the existing cash flow for the paid portion.
- Walk-in customers: payment-method UI is hidden, behavior is exactly today.

**Daily Transactions reconciliation**: in `DailyTransactions.tsx`, swap the `customer_dues` query for `customer_ledger` filtered by today and `entry_type='due'`, so "Today's Due" reflects the new flow. "Cash Received" / "Cash in Hand" remain driven by `cash_transactions` (unchanged), so the "Receive Payment" action still feeds in correctly via the `due_collection` row it writes.

### 6. Visual language

- Reuses existing tokens (`bg-[#F4F6FB]`, `mx-page`, `px-page`, `text-fluid-*`, `rounded-2xl shadow-sm` cards) — no new design system
- Color rules: **due/credit = red** (`text-red-600` / `bg-red-50`), **payment/advance = green** (`text-green-600` / `bg-green-50`), neutral = `text-gray-700`
- Prescription cards use larger fluid text (`text-fluid-base` for medicine, `text-fluid-lg` mono for `1+0+1`) and a left accent border in `border-l-4 border-blue-500` so a busy pharmacist can scan at a glance
- Mobile-first widths via `w-full max-w-md mx-auto`, FAB matches DailyTransactions positioning

### 7. Files

**Migration**: tables `customers`, `customer_ledger`, `customer_prescriptions` + RLS + recalc trigger.

**New pages/components**:
- `src/pages/Customers.tsx`
- `src/pages/CustomerProfile.tsx`
- `src/components/customers/QuickAddCustomerSheet.tsx`
- `src/components/customers/ReceivePaymentSheet.tsx`
- `src/components/customers/AddPrescriptionSheet.tsx`
- `src/components/customers/CustomerPickerPopover.tsx`
- `src/components/customers/LedgerTimeline.tsx`
- `src/components/customers/PrescriptionCard.tsx`

**Edited**:
- `src/App.tsx` — register two new routes
- `src/pages/More.tsx` — add "Customers" menu item
- `src/pages/CreateSale.tsx` — customer picker, prescription strip, payment-method segmented control, due/split posting logic, deep-link handling
- `src/pages/DailyTransactions.tsx` — switch "Today's Due" source to `customer_ledger`

**Unchanged**: every other page, all existing components, auth, RLS for unrelated tables, icons/manifest.

### 8. Constraints honored

- Roles & RLS use the existing `get_user_pharmacy_id()` / `is_pharmacy_admin()` security-definer functions — no new roles, no role storage on `profiles`
- All inserts include `pharmacy_id = get_user_pharmacy_id()` and `user_id = auth.uid()` to satisfy RLS
- No client-side validation of admin status; payment-collection write-back uses the same `cash_transactions` policies already in place
- No changes to icons, manifest, or app branding

