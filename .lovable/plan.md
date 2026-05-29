# Fix "Add Prescription" sheet keyboard cutoff

## Root cause

`SheetContent` (in `src/components/ui/sheet.tsx`) reacts to the on-screen keyboard by translating the whole bottom sheet upward by the keyboard height (`transform: translateY(-inset)`). When the form is taller than `viewportHeight − keyboardHeight`, the top of the sheet (Search inventory field, header) moves above the viewport and the user cannot scroll it back because the lift happens on the sheet element itself, not on its scroll container.

`max-h-[92vh] overflow-y-auto` does not help because `92vh` is measured against the layout viewport, not the visual viewport, so the sheet stays taller than the visible area while the keyboard is open.

## Fix (frontend only, scoped to the Add Prescription modal)

Update **`src/components/customers/AddPrescriptionSheet.tsx`**:

1. Override the sheet's default lift behavior for this modal by passing an inline `style={{ transform: "none" }}` to `SheetContent`, so the sheet stays anchored to the bottom of the visual viewport.
2. Replace `max-h-[92vh]` on `SheetContent` with a dynamic cap that subtracts the keyboard inset:
   - Use `useKeyboardInset()` to get current keyboard height.
   - Set `maxHeight: \`calc(100dvh - ${inset}px)\`` (with a small top margin so the rounded top edge is visible).
3. Wrap the form body (everything inside `SheetContent` after `SheetHeader`) in the existing `KeyboardAvoidingScroll` component (`src/components/ui/keyboard-avoiding-scroll.tsx`) so:
   - The focused input auto-scrolls into view (already implemented in that component).
   - Bottom padding equals the keyboard inset, guaranteeing the last field is reachable.
4. Keep `SheetHeader` outside the scroll area (sticky-feeling top) so the title stays visible, and make the inner scroll container fill remaining height (`flex-1 min-h-0`). Restructure `SheetContent` children as a flex column:

   ```text
   SheetContent (flex flex-col, maxHeight dynamic)
   ├── SheetHeader (shrink-0)
   └── KeyboardAvoidingScroll (flex-1 min-h-0)
       └── existing form fields
   ```

5. Remove the now-redundant `overflow-y-auto` from `SheetContent` since scrolling moves to the inner container.

## What stays the same

- Visual appearance when the keyboard is closed (same paddings, rounded top, header copy, field styles).
- No changes to `sheet.tsx`, `useKeyboardInsets`, or any other modal — the override is local to `AddPrescriptionSheet` to avoid regressing other bottom sheets.
- No backend, query, or data changes.

## Out of scope

- Other bottom sheets that may have the same pattern (can be migrated later if reported).
- React Native `KeyboardAvoidingView` / `Platform.OS` APIs — this is a web project (React + Vite), so the web equivalents (`visualViewport`, dynamic `maxHeight`, `KeyboardAvoidingScroll`) are used instead.
