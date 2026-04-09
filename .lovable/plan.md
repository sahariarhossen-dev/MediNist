

## Plan: Restore "Add New Product" Button on Inventory Page

### Problem
The previous refactor removed the "Add New Product" button that lets users manually add medicines not in the master catalog. Users need this option back, visible when the search bar is idle.

### Changes

**File: `src/pages/Inventory.tsx`**

1. **Add button below the header area** (after the search bar section, around line 341): Insert an "Add New Product" button that navigates to `/add-product` for manual entry.

2. **Conditional visibility**: Wrap the button with `{!searchOpen && ( ... )}` so it only appears when the search input is not active. When searching, the button hides to maximize space for results.

3. **Styling**: A full-width, touch-friendly button with `w-full py-3 rounded-xl` using a dashed border style and a `Plus` icon — modern, consistent with the existing card-based design. Example:
   ```
   <button className="w-full py-3 rounded-xl border-2 border-dashed border-primary/30 
     text-primary font-medium flex items-center justify-center gap-2 
     active:scale-[0.98] transition-all">
     <Plus size={18} /> Add New Product
   </button>
   ```

4. **Navigation**: On tap, calls `navigate("/add-product")` — the same manual entry form used for editing products. No logic changes to the AddProduct page.

### Files Modified
- `src/pages/Inventory.tsx` — add ~10 lines for the conditional button between the search bar and the medicine list

### What Stays the Same
- Master catalog search-to-inventory flow (unchanged)
- Edit product flow via long-press → navigate to `/add-product` with state (unchanged)
- AddProduct page logic (unchanged)

