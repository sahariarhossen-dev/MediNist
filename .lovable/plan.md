# Freeze "More" Page Profile Card

Redesign the top profile card on `/more` to be a static, non-clickable identity card showing only the user's name and shop name (no email, no chevron, no navigation).

## Changes

**File: `src/pages/More.tsx`**

1. **Remove navigation & chevron**
   - Change the wrapping `<div>` from `cursor-pointer` + `onClick={() => navigate("/shop-profile")}` to a plain static `<div>` (no click handler, no pointer cursor).
   - Remove the `<ChevronRight>` icon on the right side of the card.
   - Remove `ChevronRight` from the lucide imports if no longer used elsewhere in the file (it is still used by the menu list rows, so keep the import).

2. **Clean up displayed content**
   - Remove the `contactInfo` line (which renders `user?.email || profile?.phone`).
   - Remove the `const contactInfo = ...` variable.
   - Keep the avatar (circular profile picture) on the left, unchanged.
   - Display two lines of text:
     - **Line 1 (bold, prominent):** `profile?.full_name || "User"` — `font-bold text-gray-900 text-fluid-base`
     - **Line 2 (neutral gray, smaller):** `pharmacyName || "Your Pharmacy"` — `text-fluid-sm text-gray-500`

3. **Vertical centering & spacing**
   - The flex row already uses `items-center`, so removing the third text line will naturally center the two remaining lines next to the avatar.
   - Keep `p-4`, `rounded-2xl`, `bg-white`, `shadow-sm` for the clean minimal look.
   - Wrap the two text lines in a `flex flex-col justify-center` container to ensure perfect vertical centering.

## Email relocation note

The user's email is already visible inside the **Profile / Account Settings** page (`/profile` — `src/pages/Profile.tsx`), reachable via the avatar in the top-right `AppHeader`. No changes needed there — removing it from the More card is sufficient to satisfy "email only visible within User Identity / Account Settings".

## Result

The top card on `/more` becomes a static identity card:

```text
┌─────────────────────────────────────────┐
│  (avatar)   Md Sahariar Hossen          │
│             Nasser Medical Hall         │
└─────────────────────────────────────────┘
```

No chevron, no click behavior, no email shown.
