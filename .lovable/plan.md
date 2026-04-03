

## Update Company Selection Flow

### Overview
Redesign the AddCompany page to use inline company creation with real-time duplicate validation, matching the uploaded sketch.

### Changes to `src/pages/AddCompany.tsx`

**Header**: Change title from "Add New Company" to "Select Your Company".

**Inline creation flow**:
- The "+ Add New Company" button toggles an expandable inline form (not a separate page).
- The inline form contains:
  - A text input with a green checkmark icon when valid, red X when duplicate.
  - A status label: "Already Exists" (red) if name matches an existing company for this pharmacy, or "Don't Match" (green) if unique.
  - Two action labels/buttons: "Don't Match" / "Already Exists" on the left, "Save" on the right.
  - "Save" button is disabled (grey, low opacity) when duplicate or empty; enabled (deep green) when unique.

**Validation logic**:
- As user types, filter the local `companies` array (already fetched) to check if `trimmed.toLowerCase()` matches any existing company name.
- No extra DB query needed — the list is already loaded.

**Save behavior**:
- Insert into `companies` table.
- On success, append the new company to the local state array (no page reload).
- Collapse the inline form.
- The new company appears in the list immediately.

**Selection**: Clicking a company navigates back to `/add-product` with company name in state (existing behavior, unchanged).

### Technical Details
- New state: `showInlineAdd` (boolean), `newName` (string).
- Duplicate check: `companies.some(c => c.name.toLowerCase() === newName.trim().toLowerCase())`.
- The inline box uses a bordered container with the input, status text, and save button arranged per the sketch.
- No new files or DB changes needed.

