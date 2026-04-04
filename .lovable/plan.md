

## Plan: Redesign Invoice Page + PDF Download

### Problem
Current invoice has generic styling, a Print button instead of Download PDF, includes unnecessary rows (Tax Rate, Total Tax, Shipping/Handling), and doesn't match the uploaded sketch layout. Also missing proprietor name and email fields.

### Database Changes

**Migration: Add `email` and `proprietor_name` columns to `pharmacies` table**

```sql
ALTER TABLE public.pharmacies ADD COLUMN email text;
ALTER TABLE public.pharmacies ADD COLUMN proprietor_name text;
```

These fields will be populated by pharmacy owners and displayed dynamically on the invoice.

### Code Changes

**1. Install `jspdf` and `html2canvas`**

```bash
npm install jspdf html2canvas
```

**2. Rewrite `src/pages/Invoice.tsx`**

Complete redesign:

- **Top bar**: Remove Print button. Add "Download PDF" button (uses `html2canvas` + `jspdf` to capture the invoice container and save as PDF). Keep Close (X) button on left.

- **Header section** (two columns, no emerald border):
  - **Left column** — 5 lines from pharmacy/profile data:
    1. Shop name (bold, ~text-xl, strong font weight)
    2. Address + upazila/district (e.g., "Notun Hat More, Ishwordi - Pabna")
    3. Proprietor name: `pro- {pharmacy.proprietor_name}`
    4. Mobile: `Mob-{profile.phone}`
    5. Email: `Email- {pharmacy.email}`
  - **Right column** — 6 lines:
    1. Red/dark icon + "INVOICE" (large, bold, uppercase)
    2. "Transaction Confirm By"
    3. Sale type (Retail/Wholesale)
    4. Seller name (from profiles)
    5. Invoice ID: `INV-{sale.id.slice(0,11)}`
    6. Timestamp: `Dkh-{HH:mm}/{dd-MM-yy}`

- **Red divider line** between header and table (matching sketch's red accent)

- **Items table**: Keep existing structure — DESCRIPTION, QTY, UNIT PRICE, TOTAL with red header row (`bg-red-700 text-white`) per the sketch. Alternating row shading.

- **Summary section** (right-aligned): Only keep:
  - Subtotal
  - Discount (%)
  - Subtotal Less Discount
  - **Balance Due** — prominent, bold, large text with ৳ currency, separated by a bold line

- **Remove**: Tax Rate, Total Tax, Shipping/Handling rows entirely.

- **Remarks section**: Keep at bottom-left as "Remarks / Payment Instructions"

- **PDF generation function**:
  ```typescript
  const handleDownloadPDF = async () => {
    const element = document.getElementById("invoice-content");
    if (!element) return;
    const canvas = await html2canvas(element, { scale: 2, useCORS: true });
    const pdf = new jsPDF("p", "mm", "a4");
    const imgData = canvas.toDataURL("image/png");
    const imgWidth = 190;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    pdf.addImage(imgData, "PNG", 10, 10, imgWidth, imgHeight);
    pdf.save(`${invoiceId}.pdf`);
  };
  ```

- **Data fetching**: Also fetch `user.email` from Supabase auth session, and pharmacy `email`/`proprietor_name` from the updated pharmacies table. Fetch seller's phone from profiles.

**3. Update `src/pages/Invoice.tsx` — fetch expanded pharmacy fields**

Update the pharmacy select query to include `email, proprietor_name`:
```typescript
supabase.from("pharmacies").select("name, address, division, district, upazila, email, proprietor_name")
```

Update seller profile query to include phone:
```typescript
supabase.from("profiles").select("full_name, phone")
```

### Color scheme change
Per the sketch (image_8.png), the accent color shifts from emerald/green to **red** (`bg-red-700`) for the table header and divider lines, matching the professional pharmacy invoice look.

### Files affected
- **Migration** — add `email` and `proprietor_name` to `pharmacies`
- `src/pages/Invoice.tsx` — full rewrite with new layout, PDF download, red theme
- `package.json` — add `jspdf` and `html2canvas` dependencies

