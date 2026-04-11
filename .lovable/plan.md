

## Plan: Transform More Page into Professional Branded UI

### Changes — Single file: `src/pages/More.tsx`

**1. Remove redundant "Profile" menu item**
- Delete `{ label: "Profile", icon: User, path: "/profile" }` from `menuItems`
- Add `LogOut` action and `HelpCircle` menu item
- Update menu items with colorful icon backgrounds (different colors per item)

**2. Replace top header + user card with a gradient profile header**
- Remove the existing plain header (Medinist title + bell + avatar)
- Remove the separate "User Info Card" section
- Replace with a single gradient hero section (`bg-gradient-to-r from-blue-600 to-indigo-700`) containing:
  - White-bordered avatar circle (large, centered or left-aligned)
  - User name in bold white, phone in white/70 opacity
  - Pharmacy name in white/60 opacity
  - Make entire section clickable → navigates to `/shop-profile`

**3. Page background**
- Change `bg-background` to `bg-gray-50`

**4. Menu items styling**
- Use white `bg-white` cards with `shadow-sm rounded-xl` instead of `bg-muted rounded-2xl`
- Each item gets a unique colored icon circle (e.g., Inventory=blue, Shop=emerald, Settings=gray, Help=amber, Logout=red)
- Keep `ChevronRight` on the right
- Add `LogOut` as the last item with red styling, calling `signOut`

**5. Add imports**
- `LogOut, HelpCircle` from lucide-react
- `signOut` from `useAuth`

### No other files modified
The AppLayout header is minimal (just renders children + BottomNav), so no header sync needed — the More page owns its own header.

