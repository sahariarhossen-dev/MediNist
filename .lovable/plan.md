# Phase 2 — Contextual Chat Cards (Medicine & Invoice)

Frontend-only upgrade to the chat room. No DB/schema changes; cards travel as a sentinel payload inside `chat_messages.content`.

## Payload convention

A card message is a single-line JSON sentinel stored in `content`:

```
[[card:v1]]{"kind":"medicine","data":{...}}
```

- `parseCardPayload(content)` returns `{ kind, data } | null`.
- `MessageItem` checks for a card first; if present, it renders the card component instead of plain text. Existing text-only messages are unaffected.
- A graceful fallback string (e.g. `"💊 Shared: Napa Extend 665mg"`) is sent as the `content` for clients that ever fail to parse (e.g. notification previews). Implementation: send the JSON sentinel **plus** a human-readable suffix on a second line; the parser only consumes the first line.

## New files

1. `src/lib/chatCards.ts` — types + `parseCardPayload` + `buildMedicineCardContent` + `buildInvoiceCardContent`. Also exports the mock medicine list.
2. `src/components/messaging/AttachmentSheet.tsx` — bottom Sheet listing the 4 options (Photo, Document, 💊 Share Drug Card, 📄 Share Invoice Link). Triggers the existing file picker for Photo/Document; opens the medicine picker for Drug Card; sends a mock invoice card immediately for Invoice Link.
3. `src/components/messaging/MedicinePickerSheet.tsx` — bottom Sheet with search input and 3 mock rows (Napa Extend, Sergel, Monas). Selecting a row calls `onSelect(medicine)` and closes.
4. `src/components/messaging/cards/ChatMedicineCard.tsx` — the bubble layout described in the spec.
5. `src/components/messaging/cards/ChatInvoiceCard.tsx` — sibling card for the mock invoice (Supplier, Invoice #, Total, due date). Same visual rhythm.

## Edited files

- `src/components/messaging/ChatInput.tsx`
  - Replace the bare `+` button's direct file-picker call with opening `<AttachmentSheet />`.
  - Sheet options:
    - Photo / Image → existing file input (image/*)
    - Document → existing file input (application/pdf)
    - 💊 Share Drug Card → opens `MedicinePickerSheet`; on select, calls `onSend(buildMedicineCardContent(med))`.
    - 📄 Share Invoice Link → calls `onSend(buildInvoiceCardContent(mockInvoice))` directly.
  - Keep the upload flow intact for the two file options.

- `src/components/messaging/MessageItem.tsx`
  - Before rendering text/attachment, call `parseCardPayload(message.content)`. If a card payload exists, render the card component inside the existing bubble container (but strip the bubble's padding/background so the card uses its own surface — wrap in a plain `div` instead of the `bg-white/[#dcf8c6]` bubble when `isCard` is true). Keep the timestamp/read-receipt row underneath.

## ChatMedicineCard spec

- Wrapper: `bg-slate-50 border border-slate-100 rounded-2xl p-4 max-w-xs shadow-sm`. When `stock === 0`, swap to `bg-amber-50/50 border-amber-100`.
- Header:
  - Title: `text-sm font-semibold text-slate-900` with a small `Pill` icon (lucide).
  - Generic: `text-[11px] text-slate-500 italic`.
- Data rows (vertical stack `mt-3 space-y-1.5`):
  - `MapPin` — Shelf: `C-2`
  - `Layers` — Stock: `142 Boxes` (red `text-red-600 font-semibold` when 0, amber `text-amber-600 font-semibold` when <20)
  - `Tag` — Price: `15.00 BDT`
  - All rows: `flex items-center gap-2 text-xs text-slate-600`, icons `h-3.5 w-3.5 text-slate-400`.
- Actions row (`mt-3 flex items-center gap-2`):
  - `View Details` — `text-xs text-indigo-600 font-medium hover:bg-indigo-50 px-2.5 py-1.5 rounded-lg` (toast "Details coming soon" for now).
  - `Order More` — `text-xs bg-slate-900 text-white px-2.5 py-1.5 rounded-lg` (toast stub).

## ChatInvoiceCard spec

- Wrapper: same neutral base (`bg-slate-50 border border-slate-100 rounded-2xl p-4 max-w-xs shadow-sm`).
- Header row: `FileText` icon + Supplier name (bold) + Invoice # subtitle.
- Data rows: Date, Total (₹/৳), Status.
- Actions: `View PDF` (ghost indigo) + `Mark Paid` (filled slate-900). Stubs (toast).

## Mock medicine source

Exported from `src/lib/chatCards.ts`:

```ts
export const MOCK_MEDICINES = [
  { id: "napa-extend-665", name: "Napa Extend 665mg", generic: "Paracetamol", shelf: "C-2", stock: 142, unit: "Boxes", price: 15.00 },
  { id: "sergel-20",      name: "Sergel 20mg",       generic: "Esomeprazole", shelf: "A-5", stock: 18,  unit: "Strips", price: 70.00 },
  { id: "monas-10",       name: "Monas 10mg",        generic: "Montelukast",  shelf: "B-1", stock: 0,   unit: "Boxes", price: 160.00 },
];
```

Picker filters by name + generic (case-insensitive substring) against this list.

## Responsiveness

- All cards use `max-w-xs` (≈ 320px) and `break-words` for the title so long names wrap.
- Picker uses shadcn `Sheet` with `side="bottom"` and `max-h-[80vh] overflow-y-auto`.
- Attachment sheet is the same Sheet primitive, height auto with safe-area `pb-[env(safe-area-inset-bottom)]`.

## Out of scope

- No backend changes, no new tables, no realtime work.
- No actual order/invoice plumbing — buttons are toast stubs.