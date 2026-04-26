# Fix Invoice PDF cut-off on mobile

## Problem

On mobile, the downloaded invoice PDF is cut off near the bottom (often missing the Total Payable / footer). The on-screen preview looks fine because it scrolls.

**Root cause** (in `src/pages/Invoice.tsx`, `handleDownloadPDF`):
1. `html2canvas` captures `#invoice-content` at the **device's CSS width** (≈390px on the user's phone). On mobile, the layout flows tall and narrow.
2. The captured canvas is then stretched to a fixed 190 mm width on the PDF, which proportionally inflates its height — frequently exceeding the A4 page height (297 mm).
3. The code calls `pdf.addImage(...)` exactly once at `y = 10mm` with no page-splitting logic, so anything past the first page is silently dropped.
4. There is no print/PDF-specific CSS to control page breaks, and the preview container uses `min-h-screen` on the wrapper, but no fixed height on the invoice itself — that part is fine; the real issue is capture width + single-page placement.

## Solution overview

Two layered fixes:

**A. Render at A4 width before capturing** — force the invoice DOM to ~794px (A4 width @ 96dpi) during capture, regardless of mobile viewport. This makes the captured layout match the desktop preview proportions.

**B. Section-based, multi-page placement** — instead of one giant image, capture the invoice in logical sections (header, items table, summary, footer) marked with `data-pdf-section`. Place each section onto the PDF, adding a new page when it would overflow. This guarantees nothing is clipped and respects page-break-inside semantics.

Plus light CSS hardening: `@page` margins and `page-break-inside: avoid` rules on summary + table rows for any browser print fallback.

## Changes

### 1. `src/pages/Invoice.tsx`

**JSX changes** — tag logical sections with `data-pdf-section`:
- The two-column header block → `data-pdf-section="header"`
- The red divider can be merged into header
- Items table wrapper (`<div class="overflow-x-auto mb-6">`) → `data-pdf-section="items"`
  - On the `<table>`, add `pdf-table` class so each `<tr>` can later be a sub-section if needed (initial pass treats whole table as one section; we'll only split per-row if a single section is taller than a page)
- Summary block (`<div class="flex justify-end">`) → `data-pdf-section="summary"`
- Closing message paragraph → `data-pdf-section="footer"`

**`handleDownloadPDF` rewrite** (logic, not literal code):
1. Constants: `A4_W = 210`, `A4_H = 297`, `MARGIN = 10`, `CONTENT_W = 190`, `GAP = 3`.
2. Temporarily force the invoice element to A4 render width:
   - Save original `style.width`, `style.maxWidth`.
   - Set `element.style.width = "794px"` and `maxWidth = "794px"` (≈ 210mm @ 96dpi).
   - `await new Promise(r => requestAnimationFrame(r))` so the layout reflows.
3. Query all `[data-pdf-section]` inside `#invoice-content`.
4. Initialize `pdf = new jsPDF("p", "mm", "a4")` and `cursorY = MARGIN`.
5. For each section:
   - `canvas = await html2canvas(section, { scale: 2, useCORS: true, backgroundColor: "#ffffff", windowWidth: 794 })`
   - Compute `hMM = canvas.height * (CONTENT_W / canvas.width)`.
   - **If section taller than a full page** (`hMM > A4_H - 2*MARGIN`): split that section's canvas into page-height slices and emit one page per slice (handles edge case of very long item tables).
   - **Else if it doesn't fit in remaining space** (`cursorY + hMM > A4_H - MARGIN` and `cursorY > MARGIN`): `pdf.addPage()`, `cursorY = MARGIN`.
   - Place the image: `pdf.addImage(dataUrl, "PNG", MARGIN, cursorY, CONTENT_W, hMM)` and `cursorY += hMM + GAP`.
6. In a `finally`, restore the saved inline styles so the on-screen layout snaps back.
7. Save as `${invoiceId}.pdf`.

Removes the existing single-shot `addImage` call.

### 2. `src/index.css`

Append a print/PDF helper block (won't affect screen rendering):

```css
@media print {
  @page { size: A4; margin: 10mm; }
  .no-print { display: none !important; }
}

#invoice-content [data-pdf-section="summary"],
#invoice-content [data-pdf-section="footer"],
#invoice-content table.pdf-table tr {
  page-break-inside: avoid;
  break-inside: avoid;
}
```

This guards against awkward splits in the section-slicing fallback and any future native browser print.

### 3. No changes to data, queries, or other pages.

## Acceptance criteria

- On a 390px-wide mobile viewport, downloading an invoice with 1–10 items produces a PDF where:
  - The Total Payable row is fully visible.
  - The footer "Thank you" line is fully visible.
  - Header, table, summary, and footer are not split mid-block.
- On a long invoice (e.g., 30+ items) the PDF spans multiple pages cleanly with no row cropped.
- Desktop downloads still look identical to before.
- No visual change to the on-screen invoice preview.

## Technical notes

- `html2canvas`'s `windowWidth` option helps it lay out responsive media queries at the forced width.
- A small `requestAnimationFrame` await is enough for Tailwind's already-applied utility classes to re-flow at the new width — no font reloads needed.
- We keep `jspdf` + `html2canvas` (already in `package.json`); no new dependencies.
