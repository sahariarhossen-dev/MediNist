## Goal
Make the quantity input on the New Sale page auto-select its current value when focused/clicked, so typing a new number replaces the existing one (e.g., typing "20" when "1" is shown results in "20", not "120").

## Change
**File:** `src/pages/CreateSale.tsx` (line ~657–663)

Add `onFocus` and `onClick` handlers to the quantity `<input>` that call `e.currentTarget.select()`. This highlights all existing text the moment the field gains focus or is tapped, both on desktop and mobile.

```tsx
<input
  type="number"
  min={1}
  value={item.quantity}
  onChange={(e) => updateQuantity(item.medicine.id, parseInt(e.target.value) || 1)}
  onFocus={(e) => e.currentTarget.select()}
  onClick={(e) => e.currentTarget.select()}
  className="w-9 font-bold text-gray-900 outline-none bg-transparent border-x-2 border-gray-900 py-1 text-xs text-center"
/>
```

## Notes
- No other logic, styling, or layout is touched.
- `onClick` is added in addition to `onFocus` because some mobile browsers place the caret on tap without re-triggering selection from `onFocus` alone.
- The +/- buttons and `updateQuantity` behavior remain unchanged.
