

## Plan: Refine Inventory Page — Back Button, Search Toggle, Remove Nav

### Changes

**1. Remove bottom nav — `src/App.tsx`**
- Remove `AppLayout` wrapper from the `/inventory` route so BottomNav is not rendered
- Change: `<AppLayout><Inventory /></AppLayout>` → just `<Inventory />`

**2. Rewrite `src/pages/Inventory.tsx`**

**Back button in header:**
- Add `ArrowLeft` icon button to the left of "Medinist" logo
- `onClick={() => navigate(-1)}` to go back
- Styled: `p-2 rounded-full bg-primary text-primary-foreground`

**Search toggle with animation:**
- Add `searchOpen` and `searchQuery` state
- In the "Add Inventory" row: when `searchOpen` is false, show title + search icon button; when true, hide title and show a full-width `Input` with auto-focus and an X close button
- Use `transition-all` for smooth slide-in effect
- Filter `medicines` list in real-time: `medicines.filter(m => m.name.toLowerCase().includes(searchQuery.toLowerCase()))`

**Layout cleanup:**
- Change `pb-24` to `pb-6` since bottom nav is removed — medicine list gets full vertical space
- Fix the nested `<p>` tag bug on line 107 (nested `<p>` inside `<p>`)

**Stock display:**
- Keep existing card layout showing pill icon, name, company, and stock quantity with the coin emoji

