

## Bottom Navigation Bar

### Overview
Add a floating bottom navigation bar with 4 items (Dashboard, Sales, AI, More) matching the reference image. Create placeholder pages for Sales, AI, and More. Integrate with protected routing.

### New Files

| File | Purpose |
|------|---------|
| `src/components/BottomNav.tsx` | Floating bottom nav bar component with 4 items |
| `src/components/AppLayout.tsx` | Layout wrapper that renders children + BottomNav (for protected routes) |
| `src/pages/Sales.tsx` | Placeholder page |
| `src/pages/AI.tsx` | Placeholder page |
| `src/pages/More.tsx` | Placeholder page |

### Changes to Existing Files

**`src/App.tsx`**
- Add routes for `/sales`, `/ai`, `/more` (all protected)
- Wrap protected routes in `AppLayout` which includes the bottom nav

**`src/pages/Index.tsx`**
- Add `pb-24` bottom padding so content doesn't get hidden behind the nav bar

### Bottom Nav Design
- Floating pill shape: `fixed bottom-4 left-4 right-4` with `rounded-2xl`, white background, soft shadow
- 4 equal items in a row, each with icon + label
- Icons: `LayoutGrid` (Dashboard), `ShoppingCart` (Sales), `Brain` (AI), `MoreHorizontal` (More)
- Active state: blue icon + text color, inactive: gray
- Uses `useLocation` to determine active route
- AI item gets a subtle highlight ring to denote it as a unique feature

### Technical Details
- NavLink-based routing for each item
- Bottom nav only shown on authenticated pages (inside AppLayout)
- No changes to Login/Register pages

