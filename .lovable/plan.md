

## Plan: Refine Profile Page and Move Logout

### Changes

**1. Profile.tsx — Add edit functionality to User Identity card**
- Add a Pencil (Edit) icon button in the top-right corner of the "User Identity" card header row (next to the title).
- Clicking it toggles inline editing: fields (Full Name, Phone) become `<input>` elements. Member ID and Designation remain read-only.
- Show Save/Cancel buttons when in edit mode. Save calls `supabase.from("profiles").update()` then `refreshProfile()`.

**2. Profile.tsx — Remove the 7-Day Sales chart**
- Delete the entire "My Sales — Last 7 Days" card section (lines 230-257).
- Remove the `recharts` imports, `MiniTooltip` component, `chartData` state, and `fetchMySales` logic since they are no longer needed.
- Remove unused `date-fns` imports.

**3. Profile.tsx — Add Security section**
- Below "Monthly Target", add a new Card titled "Security".
- Include a row with "2-Step Verification" label, subtext "Protect your account with an extra layer of security.", and a toggle `Switch` component (visual only / informational for now since Supabase MFA requires additional setup).

**4. Profile.tsx — Add Log Out button**
- At the bottom of the page, add a prominent logout button styled with `bg-destructive/10 text-destructive` and a `LogOut` icon.
- On click, call `signOut()` from AuthContext and navigate to `/login`.

**5. More.tsx — Remove Logout option**
- Delete the standalone Logout button (lines 78-87) and remove the `handleLogout` function.
- Remove unused `LogOut` import.

### Files Modified
- `src/pages/Profile.tsx` — Edit icon, remove chart, add security section, add logout button
- `src/pages/More.tsx` — Remove logout button

