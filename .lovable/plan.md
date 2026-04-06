

## Plan: Long Press Context Menu for Inventory Cards

### Overview
Add a long-press (1.5s) interaction on medicine cards that triggers a centered action popup with Edit and Delete options. Edit navigates to AddProduct pre-filled with product data. Delete shows a confirmation dialog before removing from the database.

### Changes

**1. Update `src/pages/Inventory.tsx`**

- **Long press state**: Add `longPressId` (the medicine being actioned), `pressTimer` ref, and `pressing` state for visual feedback.
- **Touch/mouse handlers**: `onTouchStart`/`onMouseDown` starts a 1.5s timer setting `longPressId`. `onTouchEnd`/`onMouseUp`/`onTouchMove` clears the timer. While holding, set `pressing` to the card ID for the `scale-95` visual effect.
- **Prevent click conflicts**: If long press fires, prevent the normal card click from also triggering.
- **Action overlay**: When `longPressId` is set, render a fixed full-screen overlay with `backdrop-blur-sm bg-black/40`. Centered popup (`rounded-2xl bg-background shadow-2xl`) shows:
  - Medicine name as title
  - **Edit Product** button with `Pencil` icon → navigates to `/add-product` with full medicine data in `location.state`
  - **Delete Product** button with `Trash2` icon in red
  - Close/cancel option
- **Delete confirmation**: Add `deleteConfirmId` state. Clicking Delete swaps the popup content to a confirmation: "Are you sure you want to delete [Name]?" with Cancel and Confirm (red) buttons.
- **Delete logic**: On confirm, call `supabase.from("medicines").delete().eq("id", id)`, remove from local state, show toast.
- **Card className**: Add `transition-transform duration-150` and conditionally apply `scale-95` when `pressing === med.id`.

**2. Update `src/pages/AddProduct.tsx`**

- Support **edit mode**: Check `location.state` for an `editId` field.
- If `editId` exists, change header to "Edit Product", pre-fill all fields from state data.
- Change save handler: if `editId`, use `.update()` instead of `.insert()` on the medicines table.
- Keep all existing field logic and tri-unit stock format intact.

**3. Update `src/App.tsx`**

- No route changes needed — AddProduct already exists at `/add-product` and accepts `location.state`.

### Technical Details

- Long press uses `setTimeout` with 1500ms, cleared on pointer up or move (>10px threshold to avoid scroll conflicts)
- Overlay uses `fixed inset-0 z-50` with `animate-in fade-in duration-200`
- Popup uses `animate-in zoom-in-95 duration-200` for smooth entry
- Delete uses `.delete().eq("id", med.id)` — RLS policy already covers pharmacy scoping
- Edit navigation passes: `{ editId, name, companyName, productType, stripPerPack, pcsPerStrip, productSize, totalQuantity: stock_quantity, stockAlert: stock_alert, mrp: price }`

### Files Changed
1. `src/pages/Inventory.tsx` — long press handlers, overlay/popup, delete flow
2. `src/pages/AddProduct.tsx` — edit mode support with pre-filled data and update logic

