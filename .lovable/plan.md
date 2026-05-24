## Debounce Search Input to 300 ms with Custom Hook

### Problem
The search input currently debounces inline at 250 ms. We need a slightly longer 300 ms delay and a cleaner, reusable custom hook.

### Solution

1. **Create `src/hooks/useDebounce.ts`**
   - Accepts a generic value `T` and a delay (default 300 ms).
   - Uses `useState` + `useEffect` with `setTimeout`/`clearTimeout`.
   - Returns the debounced value.

2. **Update `src/pages/Inventory.tsx`**
   - Remove the inline `useEffect` debounce (lines 219–222).
   - Import and call `useDebounce(searchQuery, 300)` to produce `debouncedSearch`.
   - All existing logic (`isDualMode`, catalog fetch, stale-request guard, deduplication, UI) remains untouched.

### Result
- API requests fire only after the user stops typing for 300 ms.
- Hook is reusable for future components.

### Files changed
- `src/hooks/useDebounce.ts` (new)
- `src/pages/Inventory.tsx` (swap inline debounce for hook)