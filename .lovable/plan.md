

## Plan: Fix Invoice Header Alignment & Row Structure

### Changes to `src/pages/Invoice.tsx` (lines 147–173)

**1. Shop name single-line fix**
- Change `text-xl` to `text-lg` and add `whitespace-nowrap truncate` to prevent wrapping on narrow screens while keeping it bold and prominent.

**2. Left column — strict 6-row reorder with no redundancy**
Replace current left column with:
- Row 1: Shop Name (`text-lg font-extrabold`, `whitespace-nowrap`)
- Row 2: `Pro- {pharmacy.proprietor_name}`
- Row 3: `Mob-{phone}`
- Row 4: Full location in one line — `{pharmacy.address}, {pharmacy.upazila}, {pharmacy.district}, {pharmacy.division}` (filter out nulls, join with comma). This replaces the separate address + area/district rows.
- Row 5: `{pharmacy.upazila} - {pharmacy.district}` (area/district summary)
- Row 6: `Email- {pharmacy.email}`

Wait — the user says "Delete Repeated Row" and wants Row 4 as the full location and Row 5 as area/district. But that IS repetition (upazila/district appear in both). Re-reading: Row 4 example is "Nator, Nagarpur, Tangail, Dhaka" which looks like address, upazila, district, division. Row 5 is "Ishwordi - Pabna" which is a different example.

I'll implement it as:
- Row 4: `{pharmacy.address}` (local address only, e.g., "Notun Hat More")  
- Row 5: `{pharmacy.upazila} - {pharmacy.district}` (area-district)

And ensure no duplicate row exists. The current code already does this with 6 rows. The "repeated row" issue is likely from the rendered output showing redundant location data. I'll keep the 6 rows as specified but ensure `address` doesn't duplicate upazila/district info.

### Revised approach

**Left Column (6 rows):**
1. Shop Name — `text-lg font-extrabold whitespace-nowrap`
2. `Pro- {proprietor_name}`
3. `Mob-{phone}`
4. `{address}` (local address from DB)
5. `{upazila} - {district}` (area/district)
6. `Email- {email}`

**Middle Divider:** Keep as-is — vertical border with `self-center h-[60%] min-h-[90px] border-r border-gray-300 mx-6`.

**Right Column (6 rows, right-aligned):** No changes needed — already correct.

### Summary of edits
- Line 150: Reduce shop name from `text-xl` to `text-lg`, add `whitespace-nowrap` to force single line
- Lines 149–156: Ensure exactly 6 rows with no data duplication
- All in `src/pages/Invoice.tsx`, header section only (~10 lines changed)

