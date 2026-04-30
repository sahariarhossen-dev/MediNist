Redesign the Financial Card on Customer Profile (`src/pages/CustomerProfile.tsx`) into a compact, iOS-inspired card. Single-file visual change — no DB or logic changes; month labels and monthly totals already derive correctly from `ledger`.

## Changes (financial card block only)

**Container**
- Padding `p-4` → `p-3.5`, keep `rounded-2xl` (16px), soft shadow `shadow-[0_1px_2px_rgba(16,24,40,0.04)]`, tighter internal spacing.

**Total Due header**
- Label: `text-[10px] font-medium uppercase tracking-[0.08em] text-gray-400` (lighter, less shouty).
- Amount: `text-[28px] font-semibold tabular-nums tracking-tight` instead of `text-3xl font-extrabold`. Colors unchanged (red / emerald / gray based on sign).

**Monthly stats row (dynamic month)**
- Replace the two tinted blocks with a single flat `bg-gray-50/60 rounded-xl` container split into two columns by a thin `divide-x divide-gray-100`.
- Left column: `{MONTH} SALES` — label `text-[10px] text-red-500/80 tracking-wider`, amount `text-[15px] font-semibold tabular-nums text-gray-900`.
- Right column: `{MONTH} PAID` — label `text-[10px] text-emerald-600/80 tracking-wider`, amount `text-[15px] font-semibold tabular-nums text-gray-900`.
- Month auto-updates via existing `monthLabel` (uppercased).

**Action buttons (compact, side-by-side)**
- `grid grid-cols-2 gap-2 mt-3`, both `h-9 rounded-xl text-[13px]`.
- Receive Payment: solid `bg-emerald-600 hover:bg-emerald-700 text-white font-semibold` + `HandCoins` icon.
- Add Manual Due: ghost `bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 font-medium` + `MinusCircle` icon.

## Data
No changes. `monthLabel`, `monthly.sales` (sum of `entry_type='due'` for current month), and `monthly.paid` (sum of `entry_type='payment'` for current month) are already correct and dynamic.

## Out of scope
Identity card, tabs, prescription vault, ledger timeline, sheets, and any database work.
